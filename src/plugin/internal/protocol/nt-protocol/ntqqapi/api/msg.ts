import { ChatType, ElementType, GroupMemberRole, GroupMsgMask, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { Msg } from '../proto'
import { convertToRawMessage } from '../dispatcher'
import { createReadStream, promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { filterNullable, uint32ToIPV4Addr } from '@/common/utils'
import { isDebugEnabled } from '@/common/logger'
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

  async getMsgReactionList(peer: Peer, msgSeq: number, emojiId: string, count: number, cookie: string) {
    return await this.ctx.qqProtocol.fetchMsgEmojiLikes(+peer.peerUid, msgSeq, emojiId, count, cookie)
  }

  async recallMsg(peer: Peer, msgSeq: number, clientSeq?: number, msgRandom?: number, msgTime?: number) {
    if (peer.chatType === ChatType.Group) {
      await this.ctx.qqProtocol.recallGroupMessage(+peer.peerUid, msgSeq)
    } else {
      // clientSequence 是发送时自己生成的临时号, c2cMsgSeq 来自 PbSendMsgResp (调用方经 msgSeq 传入);
      // 两个都得是发送时的真值, server 才找得到要撤回的消息
      await this.ctx.qqProtocol.recallC2CMessage(
        peer.peerUid,
        clientSeq!,
        msgRandom!,
        msgTime!,
        msgSeq!,
      )
    }
  }

  /** 按 (peerUid, msgRandom) 匹配: random 是两端唯一可靠对得上的字段, msgSeq 偶尔会差几个 */
  private waitForSelfEcho(peer: Peer, random: number, timeoutMs: number): Promise<RawMessage> {
    return new Promise((resolve, reject) => {
      const dispose = this.ctx.on('nt/message-sent', (data) => {
        const msg = data.message
        // 调用方可能传 number 群号, 回声里是 string
        if (String(msg.peerUid) !== String(peer.peerUid)) return
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

  async sendMsg(peer: Peer, msgElements: SendMessageElement[], groupMsgMask?: GroupMsgMask): Promise<RawMessage> {
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

    const building = new MessageBuilding(this.ctx, msgElements, chatType, peer.peerUid)
    const tBuild0 = Date.now()
    const { elems, content } = await building.build()
    const tBuildDone = Date.now()

    // 群: server 会把消息回声 (OlPush 82) 给发送方, 先挂 listener 等回声拿真实的 groupMsgSeq + msgUid, 收发两端算出的
    // shortId 才一致。C2C 没有回声, 但 msgUid = (0x01000000 << 32) | random, 本地直接算
    const random = randomBytes(4).readUInt32BE(0)
    const isGroup = chatType === ChatType.Group
    const echoP = isGroup && groupMsgMask !== GroupMsgMask.NotAllow ? this.waitForSelfEcho(peer, random, 10000) : null
    // 发送失败会在 await echoP 之前 throw, 不挂 catch 的话 timer 之后的 reject 就成了 unhandledRejection
    echoP?.catch(() => { })

    const fileElem = elems.find(e => e.transElemInfo?.elemType === 24)
    if (fileElem) {
      const buf = fileElem.transElemInfo!.elemValue!.subarray(3)
      const extra = Msg.GroupFileExtra.decode(buf)
      const ret = await this.ctx.qqProtocol.feedGroupFile(groupCode!, extra.inner.info.fileId, random, extra.inner.info.busId)
      if (ret.feedsInfoRsp.retCode !== 0n) {
        throw new Error(`发送文件失败 (code=${ret.feedsInfoRsp.retCode}): ${ret.feedsInfoRsp.clientWording}`)
      }
      return await echoP!
    }

    const ret = await this.ctx.qqProtocol.sendMessage({
      chatType,
      groupCode,
      toUid: chatType !== ChatType.Group ? peer.peerUid : undefined,
      elems,
      random,
      content,
    })
    const tPbSendDone = Date.now()

    if (ret.resultCode !== 0) {
      throw new Error(`发送消息失败 (code=${ret.resultCode}): ${ret.errMsg}`)
    }
    if (ret.sequence === 0) {
      throw new Error('发送消息失败 (sequence=0)')
    }

    const echoed = echoP ? await echoP : undefined
    const tEchoDone = Date.now()
    if (isDebugEnabled()) {
      this.ctx.logger('ntMsgApi').debug(
        `[timing] sendMsg: build=${tBuildDone - tBuild0}ms PbSendMsg=${tPbSendDone - tBuildDone}ms waitEcho=${tEchoDone - tPbSendDone}ms (isGroup=${isGroup}) total=${tEchoDone - tBuild0}ms`
      )
    }

    const result: RawMessage = echoed ?? {
      msgId: ((0x01000000n << 32n) | BigInt(ret.random)).toString(),
      msgTime: ret.timestamp!,
      // 群是 groupMsgSeq, C2C 是 c2cMsgSeq, 都双端一致; 撤回 C2C 要用它
      msgSeq: ret.sequence,
      msgRandom: ret.random,
      senderUid: this.ctx.qqProtocol.selfInfo.uid,
      senderUin: +this.ctx.qqProtocol.selfInfo.uin,
      peerUid: peer.peerUid,
      // 群的 peerUid 就是群号, 当 uid 查会得到 0
      peerUin: chatType === ChatType.Group
        ? +peer.peerUid
        : await this.ctx.ntUserApi.getUinByUid(peer.peerUid),
      sendNickName: '',
      sendMemberName: '',
      chatType,
      elements: parseElements(elems as InferProtoModel<typeof Msg.Elem>[], chatType === ChatType.Group),
      peerName: '',
      tempFromGroupCode: chatType === ChatType.TempC2CFromGroup ? groupCode! : 0,
      clientSeq: ret.clientSequence,
      forwardAvatar: '',
      memberRole: GroupMemberRole.NotApplicable
    }
    return result
  }

  // 历史消息只有单条 Msg.Message, 实时 OlPush 的 rawPb 是整个 PushMsg 包, 两者语义不同
  private rawPbHex(bytes: Buffer): string {
    return bytes.toString('hex')
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
      msgList: filterNullable(messages.map(e => convertToRawMessage(Msg.Message.decode(e), this.rawPbHex(e), this.ctx.qqProtocol.selfInfo.uid)))
    }
  }

  /** 一次最多拉取 30 条消息 */
  async getMsgsBySeqAndCount(peer: Peer, msgSeq: number, cnt: number, queryOrder: boolean) {
    const startSeq = queryOrder ? Math.max(1, msgSeq - cnt + 1) : msgSeq
    const endSeq = queryOrder ? msgSeq : msgSeq + cnt - 1
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
      msgList: filterNullable(messages.map(e => convertToRawMessage(Msg.Message.decode(e), this.rawPbHex(e), this.ctx.qqProtocol.selfInfo.uid)))
    }
  }

  async getC2CMsgsByTimeAndCount(peer: Peer, msgTime: number, cnt: number, queryOrder: boolean) {
    const res = await this.ctx.qqProtocol.getC2CRoamMessages(
      peer.peerUid,
      msgTime,
      cnt,
      queryOrder ? 1 : 2
    )
    return {
      msgList: filterNullable(res.messages.map(e => convertToRawMessage(Msg.Message.decode(e), this.rawPbHex(e), this.ctx.qqProtocol.selfInfo.uid)))
    }
  }

  async setMsgRead(peer: Peer, startSeq: number) {
    return await this.ctx.qqProtocol.reportMessageRead(peer.chatType, peer.peerUid, startSeq)
  }

  async getCustomFaceList() {
    const resp = await this.ctx.qqProtocol.listFavEmojis()
    const ui = resp.userInfo
    const bid = ui.bid || 'qq_expression'
    const uin = this.ctx.qqProtocol.selfInfo.uin
    // https://p.qpic.cn/{bid}/{uin}/{emoji_id}/0
    const emojiInfoList = ui.fileName.map(emojiId => ({
      emojiId,
      url: `https://p.qpic.cn/${bid}/${uin}/${emojiId}/0`,
    }))
    return { retCode: resp.retCode, errMsg: resp.errMsg, emojiInfoList }
  }

  async addCustomFace(emojiPath: string) {
    const stat = await fsp.stat(emojiPath)
    const md5 = await getMd5BufferFromFile(emojiPath)
    const prep = await this.ctx.qqProtocol.addFavEmojiPrep({ md5, fileSize: stat.size })
    const body = prep.body
    if (!body || body.retCode !== 0) {
      return { retCode: body?.retCode ?? -1, errMsg: '', emojiId: '' }
    }
    const emojiId = body.ext?.emojiId || ''
    // 没给 uKey 就是秒传命中
    if (!body.uKey || body.uKey.length === 0) {
      return { retCode: 0, errMsg: '', emojiId }
    }
    const ips = body.uploadIps
    const ports = body.uploadPorts // 全部为 80 端口
    if (ips.length === 0) return { retCode: -1, errMsg: 'no upload server returned', emojiId }
    const server = []
    for (const [index, ip] of ips.entries()) {
      // uploadPorts 都是 80, 实际用 15000
      server.push(`${uint32ToIPV4Addr(ip)}:15000`)
      //server.push(`${uint32ToIPV4Addr(ip)}:${ports[index]}`)
    }
    await new HighwayHttpSession({
      uin: this.ctx.qqProtocol.selfInfo.uin,
      cmd: 9,
      readable: createReadStream(emojiPath, { highWaterMark: 1024 * 1024 }),
      sum: md5,
      size: stat.size,
      ticket: body.uKey,
      ext: Buffer.alloc(0),
      server,
    }).upload()
    return { retCode: 0, errMsg: '', emojiId }
  }

  async deleteCustomFace(emojiIds: string[]) {
    return await this.ctx.qqProtocol.deleteFavEmojis(emojiIds)
  }

  async translatePtt2Text(msgId: string, peer: Peer, senderUin: number, voiceMsgElement: MessageElement) {
    const ptt = voiceMsgElement.pttElement!

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
        receiverUin: +this.ctx.qqProtocol.selfInfo.uin,
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
    const ret = await this.ctx.qqProtocol.sendC2CFileMessage(opts)
    if (ret.resultCode !== 0) return { ...ret, message: undefined }
    // 文件不走 sendMessage, 没人发 nt/message-sent: 这里补一条, 不然 WebQQ 和各协议端都收不到自己发的文件
    const message: RawMessage = {
      msgId: ((0x01000000n << 32n) | BigInt(ret.random)).toString(),
      // 缺了也得渲染出来, seq 为 0 只影响撤回
      msgTime: ret.timestamp ?? Math.floor(Date.now() / 1000),
      msgSeq: ret.sequence ?? 0,
      msgRandom: ret.random,
      senderUid: this.ctx.qqProtocol.selfInfo.uid,
      senderUin: +this.ctx.qqProtocol.selfInfo.uin,
      peerUid: opts.toUid,
      peerUin: opts.toUin,
      sendNickName: '',
      sendMemberName: '',
      chatType: ChatType.C2C,
      // 跟接收端 convertToRawMessage 的 PrivateFile 分支对齐
      elements: [{
        elementType: ElementType.File,
        fileElement: {
          fileName: opts.fileName,
          fileSize: opts.fileSize,
          // 接收端的 fileMd5 来自 FileExtra.file.fileMd5, 而那个字段填的就是 file10MMd5
          fileMd5: opts.file10MMd5.toString('hex'),
          expireTime: ret.expireTime,
          fileUuid: opts.fileUuid,
          fileBizId: 0,
          filePath: '',
          folderId: ''
        }
      }],
      peerName: '',
      tempFromGroupCode: 0,
      clientSeq: ret.clientSequence,
      forwardAvatar: '',
      memberRole: GroupMemberRole.NotApplicable
    }
    this.ctx.parallel('nt/message-sent', { message })
    return { ...ret, message }
  }

  async sendGroupFileMessage(groupCode: number, fileId: string, busId: number) {
    const random = Math.floor(Math.random() * 0xffffffff)
    const res = await this.ctx.qqProtocol.feedGroupFile(groupCode, fileId, random, busId)
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
    return { msgList: filterNullable(top.buffer.msg.map(e => convertToRawMessage(Msg.Message.decode(e), this.rawPbHex(e), this.ctx.qqProtocol.selfInfo.uid))) }
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
