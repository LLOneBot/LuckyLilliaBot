import { ChatType, ElementType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Msg } from '../proto'
import { convertToRawMessage } from '../dispatcher'
import { createReadStream, promises as fsp } from 'node:fs'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { uint32ToIPV4Addr } from '@/common/utils'
import { HighwayHttpSession } from '../helper/highway'
import { MessageBuilding } from '../helper/messageBuilding'
import { parseElements } from '../helper/messageParsing'
import { InferProtoModel } from '@saltify/typeproto'

declare module 'cordis' {
  interface Context {
    ntMsgApi: NTQQMsgApi
  }
}

export class NTQQMsgApi extends Service {
  static inject = ['ntUserApi', 'ntFileApi', 'qqProtocol', 'store']

  constructor(protected ctx: Context) {
    super(ctx, 'ntMsgApi')
  }

  /** 把 SsoGetGroupMsg/SsoGetC2CMsg 返回的 Msg.Message 列表转成 RawMessage */
  private toRawMessages(decodedMessages: any[], chatType: ChatType): RawMessage[] {
    const msgType = chatType === ChatType.Group ? 82
      : chatType === ChatType.TempC2CFromGroup ? 141
        : 166
    const out: RawMessage[] = []
    for (const m of decodedMessages) {
      const r = convertToRawMessage(m, msgType)
      if (r) out.push(r)
    }
    return out
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean, _emojiType?: string) {
    if (peer.chatType !== ChatType.Group) {
      throw new Error('setEmojiLike 仅支持群聊 (直连模式)')
    }
    return await this.ctx.qqProtocol.setGroupReaction(+peer.peerUid, +msgSeq, emojiId, setEmoji)
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, _parentMsgId: string): Promise<any> {
    // SsoRecvLongMsg 只接受 resid。原消息可能以两种形态出现：
    // - 自己刚发出去的回声 / lightApp 内嵌：ark JSON 里有 meta.detail.resid
    // - 服务器拉历史时回放的 richMsg(serviceId=35)：messageParsing 已经把它转成
    //   ElementType.MultiForward 并把 resid 抠到 multiForwardMsgElement.resId
    const { msgList } = await this.getMsgsByMsgId(peer, [rootMsgId])
    const msg = msgList[0]
    let resId = ''
    const arkElem: any = msg?.elements?.find((e: any) => e.elementType === ElementType.Ark)
    const bytesData = arkElem?.arkElement?.bytesData
    if (bytesData) {
      try {
        const json = JSON.parse(bytesData)
        if (json?.app === 'com.tencent.multimsg' && json?.meta?.detail?.resid) {
          resId = json.meta.detail.resid
        }
      } catch { }
    }
    if (!resId) {
      const mfElem: any = msg?.elements?.find((e: any) => e.elementType === ElementType.MultiForward)
      if (mfElem?.multiForwardMsgElement?.resId) {
        resId = mfElem.multiForwardMsgElement.resId
      }
    }
    if (!resId) {
      return { result: 2, errMsg: '找不到合并转发消息', msgList: [] }
    }
    const items = await this.ctx.qqProtocol.getMultiMsg(resId)
    const top = items?.find((x: any) => x.fileName === 'MultiMsg') ?? items?.[0]
    const rawList = (top?.buffer?.msg ?? []) as any[]
    return { result: 0, errMsg: '', msgList: this.toRawMessages(rawList, peer.chatType) }
  }

  async activateChat(_peer: Peer): Promise<any> {
    return { result: 0, errMsg: '' }
  }

  async activateChatAndGetHistory(peer: Peer, cnt: number) {
    return await this.getMsgHistory(peer, '0', cnt, true)
  }

  async getAioFirstViewLatestMsgs(peer: Peer, cnt: number): Promise<any> {
    return await this.getMsgHistory(peer, '0', cnt, true)
  }

  async getMsgsByMsgId(peer: Peer, msgIds: string[]) {
    const msgList: RawMessage[] = []
    for (const id of msgIds) {
      const cached = this.ctx.store.getMsgCache(id)
      if (cached) {
        msgList.push(cached)
        continue
      }
      // cache miss：直连协议没有 by-msgId 接口，靠 store.message 表存的 seq 远程拉
      const seq = await this.ctx.store.getMsgSeqByMsgId(id)
      if (!seq || !peer?.peerUid) continue
      try {
        const r = await this.getSingleMsg(peer, seq)
        if (r.msgList[0]) msgList.push(r.msgList[0])
      } catch (e) {
        this.ctx.logger.warn('getMsgsByMsgId fallback fetch failed', e)
      }
    }
    return { msgList }
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, queryOrder = false) {
    // 通过 SsoGetGroupMsg / SsoGetC2CMsg 按 seq 拉
    let endSeq = 0
    if (msgId && msgId !== '0') {
      const cached = this.ctx.store.getMsgCache(msgId)
      if (cached) endSeq = +cached.msgSeq
    }
    if (!endSeq) {
      // C2C: SsoGetC2CMsg 必须传真实 seq；不知道时走漫游 API 按时间拉最新 N 条
      if (peer.chatType !== ChatType.Group) {
        try {
          const now = Math.floor(Date.now() / 1000)
          const decoded = await this.ctx.qqProtocol.getC2CRoamMessages(peer.peerUid, now, cnt, 1)
          const messages = this.toRawMessages(decoded, peer.chatType)
          messages.sort((a, b) => +a.msgSeq - +b.msgSeq)
          return { msgList: queryOrder ? messages : messages.reverse() } as any
        } catch (e) {
          this.ctx.logger.error('getMsgHistory (C2C roam) failed', e)
          return { msgList: [] } as any
        }
      }
      // Group: 用 store 缓存的最新 seq 当 endSeq
      const cachedSeq = this.ctx.store.getLatestPeerSeq?.(ChatType.Group, peer.peerUid)
      if (cachedSeq) {
        endSeq = cachedSeq
      } else {
        // 完全没缓存（开机后还没收到该群消息）—— SsoGetGroupMsg 必须传真实 seq，没法盲拉
        return { msgList: [] } as any
      }
    }
    const startSeq = Math.max(1, endSeq - cnt + 1)
    try {
      const decoded = peer.chatType === ChatType.Group
        ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, startSeq, endSeq)
        : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, startSeq, endSeq)
      const messages = this.toRawMessages(decoded, peer.chatType)
      return { msgList: queryOrder ? messages : messages.reverse() } as any
    } catch (e) {
      this.ctx.logger.error('getMsgHistory failed', e)
      return { msgList: [] } as any
    }
  }

  async recallMsg(peer: Peer, msgIds: string[]): Promise<{ result: number, errMsg: string }> {
    const isGroup = peer.chatType === ChatType.Group
    let lastErr = ''
    for (const id of msgIds) {
      const msg = this.ctx.store.getMsgCache(id)
      if (!msg) {
        lastErr = `msg ${id} not in cache`
        continue
      }
      // 失败时底层 sendCommand 会抛 retCode != 0 的 SSO 错误，由调用方 try/catch 处理
      if (isGroup) {
        await this.ctx.qqProtocol.recallGroupMessage(+peer.peerUid, +msg.msgSeq)
      } else {
        await this.ctx.qqProtocol.recallC2CMessage(
          peer.peerUid,
          +msg.msgSeq,
          +msg.msgRandom,
          +msg.msgTime,
          +msg.msgSeq,
        )
      }
    }
    return { result: lastErr ? -1 : 0, errMsg: lastErr }
  }

  async sendMsg(peer: Peer, msgElements: SendMessageElement[]): Promise<RawMessage> {
    const elems = await new MessageBuilding(this.ctx, msgElements, peer.chatType, peer.peerUid).build()

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

    const ret = await this.ctx.qqProtocol.sendMessage({
      chatType,
      groupCode,
      toUid: peer.chatType !== ChatType.Group ? peer.peerUid : undefined,
      elems,
    })

    return {
      msgId: String(ret.random),
      msgType: 2,
      subMsgType: 0,
      msgTime: String(ret.timestamp || Math.floor(Date.now() / 1000)),
      msgSeq: String(ret.sequence || 0),
      msgRandom: String(ret.random),
      senderUid: selfInfo.uid,
      senderUin: selfInfo.uin,
      peerUid: peer.peerUid,
      peerUin: peer.peerUid,
      guildId: '',
      sendNickName: '',
      sendMemberName: '',
      sendRemarkName: '',
      chatType,
      sendStatus: 2,
      recallTime: '0',
      records: [],
      elements: parseElements(elems as InferProtoModel<typeof Msg.Elem>[]),
      peerName: '',
      emojiLikesList: [],
      msgAttrs: new Map(),
      isOnlineMsg: true,
      tempFromGroupCode: chatType === ChatType.TempC2CFromGroup ? groupCode! : 0
    }
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    const seq = +msgSeq
    const decoded = peer.chatType === ChatType.Group
      ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, seq, seq)
      : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, seq, seq)
    return { msgList: this.toRawMessages(decoded, peer.chatType) }
  }

  async queryFirstMsgBySeq(peer: Peer, msgSeq: string) {
    return await this.getSingleMsg(peer, msgSeq)
  }

  async queryMsgsWithFilterExBySeq(peer: Peer, msgSeq: string, _filterMsgTime: string, _filterSendersUid: string[]) {
    return await this.getSingleMsg(peer, msgSeq)
  }

  async setMsgRead(_peer: Peer): Promise<{ result: number, errMsg: string }> {
    // 直连模式：服务器无明确 ack，返回 result=0 表示本地已发出
    // 真实失败会从 sendPB 抛出
    return { result: 0, errMsg: '' }
  }

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, count: number): Promise<any> {
    const r = await this.ctx.qqProtocol.fetchMsgEmojiLikes(+peer.peerUid, +msgSeq, emojiId, count)
    const emojiLikesList = await Promise.all(r.users.map(async (u: any) => ({
      uid: await this.ctx.ntUserApi.getUidByUin(u.uin, +peer.peerUid).catch(() => ''),
      uin: String(u.uin),
      nickName: '',
      headUrl: `https://q1.qlogo.cn/g?b=qq&nk=${u.uin}&s=640`,
    })))
    return {
      emojiLikesList,
      cookie: '',
      isLastPage: !r.hasMore,
      isFirstPage: true,
    }
  }

  async fetchFavEmojiList(_count: number): Promise<any> {
    const resp = await this.ctx.qqProtocol.listFavEmojis()
    if (resp.retCode !== 0) {
      return { result: resp.retCode, errMsg: resp.errMsg || '', emojiInfoList: [] }
    }
    const ui = resp.userInfo
    if (!ui) return { result: 0, errMsg: '', emojiInfoList: [] }
    const bid = ui.bid || 'qq_expression'
    const uin = selfInfo.uin
    // 路径格式 PMHQ 抓包验过：https://p.qpic.cn/{bid}/{uin}/{emoji_id}/0
    const emojiInfoList = (ui.fileName || []).map(emojiId => ({
      emojiId,
      url: `https://p.qpic.cn/${bid}/${uin}/${emojiId}/0`,
    }))
    return { result: 0, errMsg: '', emojiInfoList }
  }

  async generateMsgUniqueId(_chatType: number) {
    // 简单本地生成：时间(秒) << 32 | random
    const time = BigInt(Math.floor(Date.now() / 1000))
    const random = BigInt(Math.floor(Math.random() * 0xffffffff))
    return String((time << 32n) | random)
  }

  async queryMsgsById(chatType: ChatType, msgId: string): Promise<any> {
    // 直连协议没有按 msgId 索引的查询接口，先查 cache，没有就靠 store.message 表里存的 seq 拉
    const cached = this.ctx.store.getMsgCache(msgId)
    if (cached) {
      if (chatType != null && cached.chatType !== chatType) return { msgList: [] }
      return { msgList: [cached] }
    }
    return { msgList: [] }
  }

  getMsgTimeFromId(msgId: string) {
    return String(BigInt(msgId) >> 32n)
  }

  async getServerTime() {
    return String(Math.floor(Date.now() / 1000))
  }

  async getMsgsBySeqAndCount(peer: Peer, msgSeq: string, cnt: number, queryOrder: boolean, _includeDeleteMsg: boolean) {
    try {
      const start = +msgSeq
      const startSeq = queryOrder ? start : Math.max(1, start - cnt + 1)
      const endSeq = queryOrder ? start + cnt - 1 : start
      const decoded = peer.chatType === ChatType.Group
        ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, startSeq, endSeq)
        : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, startSeq, endSeq)
      return { msgList: this.toRawMessages(decoded, peer.chatType) } as any
    } catch (e) {
      this.ctx.logger.error('getMsgsBySeqAndCount failed', e)
      return { msgList: [] }
    }
  }

  async getSourceOfReplyMsgByClientSeqAndTime(peer: Peer, clientSeq: string, _msgTime: string, sourceMsgIdInRecords: string): Promise<any> {
    // 直连模式：先按 sourceMsgId 直接查 cache；没有的话按 (peerUid, msgSeq) 兜底
    if (sourceMsgIdInRecords) {
      const cached = this.ctx.store.getMsgCache(sourceMsgIdInRecords)
      if (cached) return { msgList: [cached] }
    }
    const target = this.ctx.store.findCachedMsgByPeerSeq(peer.peerUid, clientSeq)
    return { msgList: target ? [target] : [] }
  }

  async translatePtt2Text(msgId: string, peer: Peer, voiceMsgElement: MessageElement): Promise<string> {
    const ptt = voiceMsgElement.pttElement
    if (!ptt) throw new Error('translatePtt2Text: 不是语音消息')
    if (peer.chatType !== ChatType.Group && peer.chatType !== ChatType.C2C) {
      throw new Error('translatePtt2Text: 只支持群和私聊语音')
    }

    // 拿原语音发送者 uin（pttTrans 请求里要传原发送者，不是当前 bot）
    let msg = this.ctx.store.getMsgCache(msgId) as RawMessage | undefined
    if (!msg) {
      const fetched = await this.getMsgsByMsgId(peer, [msgId])
      msg = fetched.msgList[0]
    }
    if (!msg) throw new Error('translatePtt2Text: 找不到消息')
    const senderUin = +msg.senderUin || +(await this.ctx.ntUserApi.getUinByUid(msg.senderUid).catch(() => '0'))
    if (!senderUin) throw new Error('translatePtt2Text: 无法获取语音发送者 uin')

    // 监听异步推送结果（按 msgUid 匹配），同时立刻发提交请求
    const result = new Promise<string>((resolve, reject) => {
      const dispose = this.ctx.on('nt/raw/ptt-trans-result', (input) => {
        if (input.msgUid !== msgId) return
        clearTimeout(timer)
        dispose()
        resolve(input.text)
      })
      const timer = setTimeout(() => {
        dispose()
        reject(new Error('translatePtt2Text 超时（30s 未收到转写结果）'))
      }, 30_000)
    })

    const md5 = (ptt.md5HexStr || '').toLowerCase()
    if (peer.chatType === ChatType.Group) {
      await this.ctx.qqProtocol.pttTransGroupReq({
        msgUid: BigInt(msgId),
        senderUin,
        groupUin: +peer.peerUid,
        voiceMd5Hex: md5,
        voiceFileId: ptt.fileUuid,
      })
    } else {
      // C2C: receiverUin 是 query 发起者自己（即 bot）
      await this.ctx.qqProtocol.pttTransC2CReq({
        msgUid: BigInt(msgId),
        senderUin,
        receiverUin: +selfInfo.uin,
        voiceMd5Hex: md5,
        voiceFileId: ptt.fileUuid,
      })
    }

    return result
  }

  async fetchGetHitEmotionsByWord(_word: string, _count: number): Promise<any> {
    return { emotionList: [] }
  }

  async addFavEmoji(emojiPath: string): Promise<any> {
    const stat = await fsp.stat(emojiPath)
    const md5 = await getMd5BufferFromFile(emojiPath)
    // 1. 申请上传，拿 uKey + 服务器地址 + emoji_id
    const prep = await this.ctx.qqProtocol.addFavEmojiPrep({ md5, fileSize: stat.size })
    const body = prep.body
    if (!body || body.retCode !== 0) {
      return { result: body?.retCode ?? -1, errMsg: '', emojiId: '' }
    }
    const emojiId = body.ext?.emojiId || ''
    // 2. 如果服务器没给 uKey 说明已经在缓存里（秒传命中），直接落地
    if (!body.uKey || body.uKey.length === 0) {
      return { result: 0, errMsg: '', emojiId }
    }
    // 3. 走 highway 上传到 servers[0]:15000，cmd=9
    const ips = body.uploadIps || []
    if (ips.length === 0) return { result: -1, errMsg: 'no upload server returned', emojiId }
    const server = uint32ToIPV4Addr(ips[0])
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
    return { result: 0, errMsg: '', emojiId }
  }

  async deleteFavEmoji(emojiIds: string[]): Promise<any> {
    const resp = await this.ctx.qqProtocol.deleteFavEmojis(emojiIds)
    return { result: resp.retCode, errMsg: resp.errMsg || '' }
  }

  async setContactLocalTop(peer: Peer, isTop: boolean): Promise<{ result: number, errMsg: string }> {
    if (peer.chatType === ChatType.Group) {
      await this.ctx.qqProtocol.setGroupPin(+peer.peerUid, isTop)
    } else {
      await this.ctx.qqProtocol.setFriendPin(peer.peerUid, isTop)
    }
    return { result: 0, errMsg: '' }
  }

  async sendShowInputStatusReq(_chatType: ChatType, _eventType: number, _toUid: string): Promise<any> {
    return { result: 0, errMsg: '' }
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
    return res.feedsInfoRsp
  }
}
