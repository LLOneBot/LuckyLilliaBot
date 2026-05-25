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
    // 入参 rootMsgId 是 OB11 客户端给的 message_id（msgId/shortId 转出的）。
    // SsoRecvLongMsg 需要 resid——从 cache 里拉出原消息的 ark JSON 解析 meta.detail.resid。
    let resId = rootMsgId
    const store = this.ctx.get('store') as any
    const cached = store?.getMsgCache?.(rootMsgId) as RawMessage | undefined
    if (cached) {
      const arkElem = cached.elements?.find((e: any) => e.elementType === ElementType.Ark)
      const bytesData = (arkElem as any)?.arkElement?.bytesData
      if (bytesData) {
        try {
          const json = JSON.parse(bytesData)
          if (json?.app === 'com.tencent.multimsg' && json?.meta?.detail?.resid) {
            resId = json.meta.detail.resid
          }
        } catch { }
      }
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

  async getAioFirstViewLatestMsgs(_peer: Peer, _cnt: number): Promise<any> {
    return { msgList: [] }
  }

  async getMsgsByMsgId(_peer: Peer, msgIds: string[]) {
    const store = this.ctx.get('store') as any
    const msgList: RawMessage[] = []
    if (store?.getMsgCache) {
      for (const id of msgIds) {
        const msg = store.getMsgCache(id)
        if (msg) msgList.push(msg)
      }
    }
    return { msgList }
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, queryOrder = false) {
    // 通过 SsoGetGroupMsg / SsoGetC2CMsg 按 seq 拉
    let endSeq = 0
    if (msgId && msgId !== '0') {
      const store = this.ctx.get('store') as any
      const cached = store?.getMsgCache?.(msgId) as RawMessage | undefined
      if (cached) endSeq = +cached.msgSeq
    }
    if (!endSeq) {
      // 不知道 seq 时尝试拉最新的 cnt 条（端点 seq=0 由协议侧处理）
      try {
        const decoded = peer.chatType === ChatType.Group
          ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, 0, cnt)
          : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, 0, cnt)
        const messages = this.toRawMessages(decoded, peer.chatType)
        return { msgList: queryOrder ? messages : messages.reverse() } as any
      } catch (e) {
        this.ctx.logger.error('getMsgHistory failed', e)
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
    const store = this.ctx.get('store') as any
    const isGroup = peer.chatType === ChatType.Group
    let lastErr = ''
    for (const id of msgIds) {
      const msg = store?.getMsgCache?.(id) as RawMessage | undefined
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
    // 直连模式没有 server 端按 msgId 索引的接口；从本地 cache 找
    // （cache 由 dispatcher 在收到 / 自己发出的消息时填充）
    const store = this.ctx.get('store') as any
    const cached = store?.getMsgCache?.(msgId) as RawMessage | undefined
    if (cached) {
      // 校验 chatType 一致性，避免拉到别的会话的消息
      if (chatType != null && cached.chatType !== chatType) {
        return { msgList: [] }
      }
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

  async getSourceOfReplyMsgByClientSeqAndTime(peer: Peer, clientSeq: string, msgTime: string, sourceMsgIdInRecords: string): Promise<any> {
    // 直连模式：先从本地 cache 查 sourceMsgId（reply elem 里通常带这个）；
    // 没找到再按 clientSeq + msgTime 在 cache 里筛
    const store = this.ctx.get('store') as any
    if (sourceMsgIdInRecords) {
      const cached = store?.getMsgCache?.(sourceMsgIdInRecords) as RawMessage | undefined
      if (cached) return { msgList: [cached] }
    }
    const all: RawMessage[] = store?.getAllMsgCache?.() ?? []
    const target = all.find((m) =>
      m.peerUid === peer.peerUid &&
      m.chatType === peer.chatType &&
      String((m as any).clientSeq ?? m.msgSeq) === String(clientSeq) &&
      String(m.msgTime) === String(msgTime)
    )
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
