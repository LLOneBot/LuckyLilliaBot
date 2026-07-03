import { ChatType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Msg } from '../proto'
import { convertToRawMessage } from '../dispatcher'
import { createReadStream, promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { filterNullable, uint32ToIPV4Addr } from '@/common/utils'
import { HighwayHttpSession } from '../helper/highway'
import { MessageBuilding } from '../helper/messageBuilding'
import { parseElements } from '../helper/messageParsing'
import { InferProtoModel, InferProtoModelInput } from '@saltify/typeproto'

declare module 'cordis' {
  interface Context {
    ntMsgApi: NTMsgApi
  }
}

export class NTMsgApi extends Service {
  static inject = ['ntUserApi', 'qqProtocol', 'store', 'ntFileApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntMsgApi')
  }

  async setGroupMsgReaction(groupCode: number, msgSeq: number, emojiId: string, setEmoji: boolean, emojiType?: number) {
    return await this.ctx.qqProtocol.setGroupReaction(groupCode, msgSeq, emojiId, setEmoji, emojiType)
  }

  async getMsgReactionList(peer: Peer, msgSeq: number, emojiId: string, count: number) {
    const resp = await this.ctx.qqProtocol.fetchMsgEmojiLikes(+peer.peerUid, msgSeq, emojiId, count)
    return {
      users: resp.users ?? [],
      totalCount: resp.totalCount ?? 0,
      hasMore: !!resp.hasMore,
    }
  }

  async recallMsg(peer: Peer, msgSeq: number, clientSeq?: number, msgRandom?: number, msgTime?: number) {
    if (peer.chatType === ChatType.Group) {
      await this.ctx.qqProtocol.recallGroupMessage(+peer.peerUid, msgSeq)
    } else {
      // SsoC2CRecallMsg.info 里两个 sequence 字段含义不同：
      //   field 1 (clientSequence) ← client 发送时自己生成的 10000-99999 临时号
      //   field 6 (c2cMsgSeq)      ← PbSendMsgResp.c2cMsgSeq (field 14)，即 server 给这条
      //                                c2c 消息分配的 c2cMsgSeq（全局双端一致） —— 由调用方在 msgSeq 传入
      // 两个都必须用发送时的真值传回去，server 才能定位被撤回的消息并向对方推 sub=138
      await this.ctx.qqProtocol.recallC2CMessage(
        peer.peerUid,
        clientSeq!,
        msgRandom!,
        msgTime!, // 这个可以填 Date.now()，副作用未知
        msgSeq!,
      )
    }
  }

  /**
   * 挂一次性 listener 等 OlPush 推回我们刚发出去那条消息的回声。
   * 用 (peerUid, msgRandom) 匹配——random 是发送方在 PbSendMsg 里自己造、server 原样
   * 广播给所有人的 32-bit 值，两端唯一可靠对得上的字段。msgSeq 偶尔会差 1-N 个槽。
   */
  private waitForSelfEcho(peer: Peer, random: number, timeoutMs: number): Promise<RawMessage> {
    return new Promise((resolve, reject) => {
      const dispose = this.ctx.on('nt/message-sent', (data) => {
        const msg = data.message
        if (msg.peerUid !== peer.peerUid) return
        if (+msg.msgRandom !== random) return
        clearTimeout(timer)
        dispose()
        resolve(msg)
      })
      const timer = setTimeout(() => {
        dispose()
        reject(new Error('waitForSelfEcho timeout'))
      }, timeoutMs)
    })
  }

  /**
   * C2C 发完 PbSendMsg 后用 SsoGetRoamMsg 反查刚发的那条，拿真 msgSeq + msgUid。
   * 匹配条件：random 一致 + msgTime 跟 PbSendMsgResp.sendTime 同秒附近（防同 random 撞）。
   * 加重试是因为 server 入库 c2c 历史流稍滞后（~50-200ms）。
   */
  async sendMsg(peer: Peer, msgElements: SendMessageElement[]): Promise<RawMessage> {
    const building = new MessageBuilding(this.ctx, msgElements, peer.chatType, peer.peerUid)
    const { elems, content } = await building.build()

    let chatType = peer.chatType
    let groupCode
    if (peer.chatType === ChatType.Group) {
      groupCode = +peer.peerUid
    } else if (peer.chatType === ChatType.TempC2CFromGroup) {
      const tempChatInfo = await this.ctx.store.getTempChatInfo(peer.peerUid)
      if (tempChatInfo) {
        groupCode = tempChatInfo.groupCode
      } else {
        chatType = ChatType.C2C
      }
    }

    // 群消息：server 会把消息原样回声（OlPush msgType=82）给发送方自己，
    //   contentHead.groupMsgSeqOrC2cClientSeq (field 5) 跟广播给群里所有人的相等。我们在 PbSendMsg 之前挂 listener、
    //   按 (peerUid, msgRandom) 匹配，等回声拿到真实 groupMsgSeq + msgUid，sender / receiver
    //   两端 createMsgShortId 算出来的 shortId 永远一致。
    //
    // C2C：server 不推 self-echo，但 server 端的 msgUid 跟客户端 random 一一对应
    //   （msgUid = (0x01000000 << 32) | random，实测样本验过），所以 msgId 本地直接算，不需 RTT。
    //   PbSendMsgResp.c2cMsgSeq (field 14) = server 给这条 c2c 消息的 c2cMsgSeq（全局双端一致），
    //   接收方在 OlPush msgType=166 contentHead.c2cMsgSeq (field 11) 拿到同样的值。
    const random = randomBytes(4).readUInt32BE(0)
    const isGroup = peer.chatType === ChatType.Group
    const echoP = isGroup ? this.waitForSelfEcho(peer, random, 7000) : null
    // send 失败/禁言等会在下面 await echoP 之前就 throw，此时 echoP 变 orphaned promise，
    // 7s 后其 timer reject 无人接 -> unhandledRejection -> 崩进程。挂 no-op catch 标记为已处理，
    // 不影响后面 await echoP 的正常 resolve/reject。
    echoP?.catch(() => { })

    const fileElem = elems.find(e => e.transElemInfo?.elemType === 24)
    if (fileElem) {
      const buf = fileElem.transElemInfo!.elemValue!.subarray(3)
      const extra = Msg.GroupFileExtra.decode(buf)
      const ret = await this.ctx.qqProtocol.feedGroupFile(groupCode!, extra.inner.info.fileId, random)
      if (ret.feedsInfoRsp.retCode !== 0n) {
        throw new Error(`发送文件失败 (code=${ret.feedsInfoRsp.retCode}): ${ret.feedsInfoRsp.clientWording}`)
      }
      return await echoP!
    }

    const ret = await this.ctx.qqProtocol.sendMessage({
      chatType,
      groupCode,
      toUid: peer.chatType !== ChatType.Group ? peer.peerUid : undefined,
      elems,
      random,
      content,
    })

    if (ret.resultCode !== 0) {
      throw new Error(`发送消息失败 (code=${ret.resultCode}): ${ret.errMsg}`)
    }

    const echoed = echoP ? await echoP : undefined

    const result: RawMessage = echoed ?? {
      // C2C 本地算 msgUid（高 32 位固定 0x01000000，低 32 位 = random）
      msgId: ((0x01000000n << 32n) | BigInt(ret.random)).toString(),
      msgTime: ret.timestamp!,
      // 群聊：ret.sequence = PbSendMsgResp.groupMsgSeq (field 11)，server 给整个群的 groupMsgSeq，双端一致。
      // C2C：ret.sequence = PbSendMsgResp.c2cMsgSeq   (field 14)，server 给这条 c2c 消息的 c2cMsgSeq，
      //   双端一致：接收方在 OlPush msgType=166 contentHead.c2cMsgSeq (field 11) 拿到同样的值。
      //   撤回 C2C 时这个值要塞 SsoC2CRecallMsg.info.c2cMsgSeq (field 6)。
      msgSeq: ret.sequence,
      msgRandom: ret.random,
      senderUid: selfInfo.uid,
      senderUin: +selfInfo.uin,
      peerUid: peer.peerUid,
      // 群聊里 peerUid 已经是 groupCode 数字字符串，不能 getUinByUid 当 user 查（会得 0）。
      // C2C/Temp 才需要把 uid 解析回 uin。
      peerUin: peer.chatType === ChatType.Group
        ? +peer.peerUid
        : await this.ctx.ntUserApi.getUinByUid(peer.peerUid),
      sendNickName: '',
      sendMemberName: '',
      chatType,
      elements: parseElements(elems as InferProtoModel<typeof Msg.Elem>[]),
      peerName: '',
      tempFromGroupCode: chatType === ChatType.TempC2CFromGroup ? groupCode! : 0,
      clientSeq: ret.clientSequence,
      forwardAvatar: ''
    }
    return result
  }

  async getSingleMsg(peer: Peer, msgSeq: number) {
    let retcode, errorMsg, messages
    if (peer.chatType === ChatType.Group) {
      const res = await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, msgSeq, msgSeq)
      retcode = res.retcode
      errorMsg = res.errorMsg
      messages = res.body.messages
    } else {
      const res = await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, msgSeq, msgSeq)
      retcode = res.retcode
      errorMsg = res.errorMsg
      messages = res.messages
    }
    return {
      retcode,
      errorMsg,
      msgList: filterNullable(messages.map(e => convertToRawMessage(Msg.Message.decode(e)))),
      msgByteList: messages
    }
  }

  async getMsgsBySeqAndCount(peer: Peer, msgSeq: number, cnt: number, queryOrder: boolean) {
    const startSeq = queryOrder ? msgSeq : Math.max(1, msgSeq - cnt + 1)
    const endSeq = queryOrder ? msgSeq + cnt - 1 : msgSeq
    let retcode, errorMsg, messages
    if (peer.chatType === ChatType.Group) {
      const res = await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, startSeq, endSeq)
      retcode = res.retcode
      errorMsg = res.errorMsg
      messages = res.body.messages
    } else {
      const res = await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, startSeq, endSeq)
      retcode = res.retcode
      errorMsg = res.errorMsg
      messages = res.messages
    }
    return {
      retcode,
      errorMsg,
      msgList: filterNullable(messages.map(e => convertToRawMessage(Msg.Message.decode(e)))),
      msgByteList: messages
    }
  }

  async setMsgRead(peer: Peer, startSeq: number) {
    return await this.ctx.qqProtocol.reportMessageRead(peer.chatType, peer.peerUid, startSeq)
  }

  async getCustomFaceList() {
    const resp = await this.ctx.qqProtocol.listFavEmojis()
    const ui = resp.userInfo
    const bid = ui.bid || 'qq_expression'
    const uin = selfInfo.uin
    // 路径格式 PMHQ 抓包验过：https://p.qpic.cn/{bid}/{uin}/{emoji_id}/0
    const emojiInfoList = ui.fileName.map(emojiId => ({
      emojiId,
      url: `https://p.qpic.cn/${bid}/${uin}/${emojiId}/0`,
    }))
    return { retCode: resp.retCode, errMsg: resp.errMsg, emojiInfoList }
  }

  async addCustomFace(emojiPath: string) {
    const stat = await fsp.stat(emojiPath)
    const md5 = await getMd5BufferFromFile(emojiPath)
    // 1. 申请上传，拿 uKey + 服务器地址 + emoji_id
    const prep = await this.ctx.qqProtocol.addFavEmojiPrep({ md5, fileSize: stat.size })
    const body = prep.body
    if (!body || body.retCode !== 0) {
      return { retCode: body?.retCode ?? -1, errMsg: '', emojiId: '' }
    }
    const emojiId = body.ext?.emojiId || ''
    // 2. 如果服务器没给 uKey 说明已经在缓存里（秒传命中），直接落地
    if (!body.uKey || body.uKey.length === 0) {
      return { retCode: 0, errMsg: '', emojiId }
    }
    // 3. 走 highway 上传到 ips[i]:15000，cmd=9
    //    server 返一组 IP, 但其中可能有失效的 (实测 ETIMEDOUT)。轮流试，第一个连通就 OK。
    //    每次循环重建 read stream — Readable 用完一次就废了。
    const ips = body.uploadIps || []
    if (ips.length === 0) return { retCode: -1, errMsg: 'no upload server returned', emojiId }
    const errors: string[] = []
    for (let i = 0; i < ips.length; i++) {
      const server = uint32ToIPV4Addr(ips[i])
      try {
        await new HighwayHttpSession({
          uin: selfInfo.uin,
          cmd: 9,
          readable: createReadStream(emojiPath, { highWaterMark: 1024 * 1024 }),
          sum: md5,
          size: stat.size,
          ticket: Buffer.from(body.uKey),
          ext: Buffer.alloc(0),
          server,
          port: 15000,
        }).upload()
        return { retCode: 0, errMsg: '', emojiId }
      } catch (e) {
        const msg = (e as Error).message || String(e)
        errors.push(`${server}:15000 - ${msg}`)
        // 继续试下一个 IP
      }
    }
    return { retCode: -1, errMsg: `所有 highway IP 都连不通: ${errors.join('; ')}`, emojiId }
  }

  async deleteCustomFace(emojiIds: string[]) {
    return await this.ctx.qqProtocol.deleteFavEmojis(emojiIds)
  }

  async translatePtt2Text(msgId: string, peer: Peer, senderUin: number, voiceMsgElement: MessageElement) {
    const ptt = voiceMsgElement.pttElement!

    // 监听异步推送结果（按 msgId 匹配），同时立刻发提交请求
    const result = new Promise<string>((resolve, reject) => {
      const dispose = this.ctx.on('nt/ptt-trans-result', (input) => {
        if (input.msgId !== msgId) return
        clearTimeout(timer)
        dispose()
        resolve(input.text)
      })
      const timer = setTimeout(() => {
        dispose()
        reject(new Error('translatePtt2Text 超时（30s 未收到转写结果）'))
      }, 30_000)
    })

    if (peer.chatType === ChatType.Group) {
      await this.ctx.qqProtocol.pttTransGroupReq({
        msgUid: BigInt(msgId),
        senderUin,
        groupUin: +peer.peerUid,
        voiceMd5Hex: ptt.md5HexStr,
        voiceFileId: ptt.fileUuid,
      })
    } else {
      // C2C: receiverUin 是 query 发起者自己（即 bot）
      await this.ctx.qqProtocol.pttTransC2CReq({
        msgUid: BigInt(msgId),
        senderUin,
        receiverUin: +selfInfo.uin,
        voiceMd5Hex: ptt.md5HexStr,
        voiceFileId: ptt.fileUuid,
      })
    }

    return result
  }

  async setPrivateInputStatus(toUid: string, eventType: number) {
    const { body } = await this.ctx.qqProtocol.setInputStatus(toUid, eventType)
    return body
  }

  async getPins() {
    return await this.ctx.qqProtocol.fetchPins()
  }

  async sendPrivateFileMessage(opts: {
    toUin: number
    toUid: string
    fileUuid: string
    fileName: string
    fileSize: number
    file10MMd5: Buffer
    crcMedia: string
  }) {
    return await this.ctx.qqProtocol.sendC2CFileMessage(opts)
  }

  async sendGroupFileMessage(groupCode: number, fileId: string) {
    const random = Math.floor(Math.random() * 0xffffffff)
    const res = await this.ctx.qqProtocol.feedGroupFile(groupCode, fileId, random)
    return {
      ...res.feedsInfoRsp,
      retCode: Number(res.feedsInfoRsp.retCode),
      feedsResultList: res.feedsInfoRsp.feedsResultList.map(e => ({
        ...e,
        retCode: Number(e.retCode)
      }))
    }
  }

  async getLatestMsgSeq(peer: Peer) {
    if (peer.chatType === ChatType.Group) {
      const { info } = await this.ctx.qqProtocol.fetchGroupExtra(+peer.peerUid)
      return info.results.latestMessageSeq
    } else {
      const { seq1, seq2 } = await this.ctx.qqProtocol.getFriendLatestSequence(peer.peerUid)
      return Math.max(seq1, seq2)
    }
  }

  async getForwardedMsgs(resId: string) {
    const { pbItemList } = await this.ctx.qqProtocol.getMultiMsg(resId)
    const top = pbItemList.find((x) => x.fileName === 'MultiMsg') ?? pbItemList[0]
    return { msgList: filterNullable(top.buffer.msg.map(e => convertToRawMessage(e))) }
  }

  async uploadForwardMsgs(
    peerUid: string,
    isGroup: boolean,
    items: InferProtoModelInput<typeof Msg.PbMultiMsgItem>[]
  ) {
    const res = await this.ctx.qqProtocol.uploadForward(peerUid, isGroup, items)
    return res.result.resId
  }

  async getRecommendFace(word: string) {
    return await this.ctx.qqProtocol.pullPics(word)
  }
}
