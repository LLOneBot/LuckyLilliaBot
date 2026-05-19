import { ChatType, ElementType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Media } from '../proto'
import { convertToRawMessage } from '../dispatcher'
import { SendElement } from '../entities'

declare module 'cordis' {
  interface Context {
    ntMsgApi: NTQQMsgApi
  }
}

export class NTQQMsgApi extends Service {
  static inject = ['ntUserApi', 'ntFileApi', 'logger', 'qqProtocol']

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

  async getTempChatInfo(_chatType: ChatType, _peerUid: string): Promise<any> {
    throw new Error('getTempChatInfo 暂未实现 (直连模式)')
  }

  private getEmojiIdType(emojiId: string) {
    return emojiId.length > 3 ? '2' : '1'
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean, _emojiType?: string) {
    if (peer.chatType !== ChatType.Group) {
      throw new Error('setEmojiLike 仅支持群聊 (直连模式)')
    }
    return await this.ctx.qqProtocol.setGroupReaction(+peer.peerUid, +msgSeq, emojiId, setEmoji)
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, _parentMsgId: string): Promise<any> {
    // mixin 的 getMultiMsg(resId) 返回 PbMultiMsgItem[]：
    //   [{ fileName: 'MultiMsg', buffer: { msg: Message[] } }, ...]
    // 第一项是顶层聊天记录，其余是嵌套 forward 的展开结果
    const items = await this.ctx.qqProtocol.getMultiMsg(rootMsgId)
    const top = items?.find((x: any) => x.fileName === 'MultiMsg') ?? items?.[0]
    const rawList = (top?.buffer?.msg ?? []) as any[]
    return { msgList: this.toRawMessages(rawList, peer.chatType) }
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
    return { msgList } as any
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

  async sendMsg(peer: Peer, msgElements: SendMessageElement[]) {
    return await this.sendMsgViaPbSendMsg(peer, msgElements)
  }

  /**
   * 直连模式发消息：构造 Msg.Elem[]，对图片等媒体先走 highway 上传
   */
  private async sendMsgViaPbSendMsg(peer: Peer, msgElements: SendMessageElement[]): Promise<RawMessage> {
    const elems: any[] = []

    for (const elem of msgElements) {
      if (elem.elementType === ElementType.Text) {
        const t = elem.textElement
        if (t.atType === 1 /* AtType.All */) {
          const attr6 = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
          elems.push({ text: { str: t.content || '@全体成员', attr6Buf: attr6 } })
        } else if (t.atType === 2 /* AtType.One */) {
          const targetUin = t.atUid && /^\d+$/.test(t.atUid) ? +t.atUid : 0
          const attr6 = Buffer.alloc(20)
          attr6.writeUInt16BE(0x0001, 0)
          attr6.writeUInt16BE(0x0000, 2)
          attr6.writeUInt16BE((t.content || '').length, 4)
          attr6.writeUInt8(0x00, 6)
          attr6.writeUInt32BE(targetUin, 7)
          attr6.writeUInt16BE(0x0000, 11)
          elems.push({ text: { str: t.content || '', attr6Buf: attr6 } })
        } else {
          elems.push({ text: { str: t.content || '' } })
        }
      } else if (elem.elementType === ElementType.Face) {
        elems.push({ face: { index: elem.faceElement.faceIndex } })
      } else if (elem.elementType === ElementType.MarketFace) {
        const m = elem.marketFaceElement
        elems.push({
          marketFace: {
            summary: m.faceName,
            itemType: 6,
            info: 1,
            faceId: Buffer.from(m.emojiId, 'hex'),
            tabId: m.emojiPackageId,
            subType: 3,
            key: m.key,
            width: m.imageWidth ?? 200,
            height: m.imageHeight ?? 200,
          }
        })
      } else if (elem.elementType === ElementType.Reply) {
        const r = elem.replyElement
        elems.push({
          srcMsg: {
            origSeqs: [+(r.replayMsgSeq ?? 0)],
            senderUin: +(r.senderUid ?? 0),
            time: +(r.replyMsgTime ?? 0),
            elems: [],
          }
        })
      } else if (elem.elementType === ElementType.Pic) {
        const p = elem.picElement
        const sourcePath = p.sourcePath
        if (!sourcePath) continue
        const isGroup = peer.chatType === ChatType.Group
        const result = isGroup
          ? await this.ctx.ntFileApi.uploadGroupImage(peer.peerUid, sourcePath)
          : await this.ctx.ntFileApi.uploadC2CImage(peer.peerUid, sourcePath)
        const msgInfoBytes = Buffer.from(result.msgInfo)
        elems.push({
          commonElem: {
            serviceType: 48,
            pbElem: Buffer.from(msgInfoBytes),
            businessType: isGroup ? 20 : 10,
          }
        })
      } else if (elem.elementType === ElementType.Video) {
        const v = elem.videoElement
        const sourcePath = v.filePath
        const thumbPath = v.thumbPath instanceof Map ? [...v.thumbPath.values()][0] : ''
        if (!sourcePath || !thumbPath) continue
        const isGroup = peer.chatType === ChatType.Group
        const result = isGroup
          ? await this.ctx.ntFileApi.uploadGroupVideo(peer.peerUid, sourcePath, thumbPath, v.fileTime ?? 0, v.thumbWidth ?? 0, v.thumbHeight ?? 0)
          : await this.ctx.ntFileApi.uploadC2CVideo(peer.peerUid, sourcePath, thumbPath, v.fileTime ?? 0, v.thumbWidth ?? 0, v.thumbHeight ?? 0)
        const msgInfoBytes = Buffer.from(result.msgInfo)
        if (process.env.DEBUG_VIDEO) {
          console.log('[video] sourceMsgInfo from server:', JSON.stringify(result.msgInfo, (_k, v) =>
            Buffer.isBuffer(v) || v?.type === 'Buffer' ? `<Buffer ${v.length || v.data?.length}>` : v).slice(0, 1500))
          console.log('[video] re-encoded MsgInfo bytes hex (first 200B):', Buffer.from(msgInfoBytes).slice(0, 200).toString('hex'))
          console.log('[video] re-encoded length:', msgInfoBytes.length)
        }
        // 注意：视频消息发送后服务端不返回 sequence（field 11 缺失），是已知行为。
        // 真正的 seq 通过 OlPush 推送（server 转码完成后）异步到达。
        elems.push({
          commonElem: {
            serviceType: 48,
            pbElem: Buffer.from(msgInfoBytes),
            businessType: isGroup ? 21 : 11,
          }
        })
        // 老格式 VideoFile elem（field 19）— 手机 QQ 用这个显示封面+播放，
        // 新版 commonElem 它认不全。compat bytes 是 server 给的 VideoFile 序列化结果，原样透传
        if (result.compat && result.compat.length > 0) {
          elems.push({
            videoFile: Buffer.from(result.compat),
          })
        }
      } else if (elem.elementType === ElementType.Ptt) {
        const p = elem.pttElement
        const sourcePath = p.filePath
        if (!sourcePath) continue
        const isGroup = peer.chatType === ChatType.Group
        const result = isGroup
          ? await this.ctx.ntFileApi.uploadGroupPtt(peer.peerUid, sourcePath, p.duration ?? 1)
          : await this.ctx.ntFileApi.uploadC2CPtt(peer.peerUid, sourcePath, p.duration ?? 1)
        const msgInfoBytes = Buffer.from(result.msgInfo)
        elems.push({
          commonElem: {
            serviceType: 48,
            pbElem: Buffer.from(msgInfoBytes),
            businessType: isGroup ? 22 : 12,
          }
        })
      } else if (elem.elementType === ElementType.File) {
        const f = elem.fileElement
        const sourcePath = f.filePath
        if (!sourcePath || !f.fileName) continue
        const isGroup = peer.chatType === ChatType.Group
        if (isGroup) {
          const result = await this.ctx.ntFileApi.uploadGroupFile(
            peer.peerUid,
            sourcePath,
            f.fileName,
            f.folderId ?? '/'
          )
          elems.push({
            groupFile: {
              filename: f.fileName,
              fileSize: BigInt(f.fileSize ?? 0),
              fileId: Buffer.from(result.fileId),
            }
          })
        }
        // C2C 文件流程不同，需要 OfflineFileUpload 协议（trans 0x211），暂未支持
      }
    }

    const isGroup = peer.chatType === ChatType.Group
    const ret = await this.ctx.qqProtocol.sendMessage({
      isGroup,
      groupCode: isGroup ? +peer.peerUid : undefined,
      toUid: !isGroup ? peer.peerUid : undefined,
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
      chatType: peer.chatType,
      sendStatus: 2,
      recallTime: '0',
      records: [],
      elements: [],
      peerName: '',
      emojiLikesList: [],
      msgAttrs: new Map(),
      isOnlineMsg: true,
    } as RawMessage
  }

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    // 简单实现：从 cache 拿源消息，逐条把 elements 重新构造成 SendElement 发到 dest
    // 接收方看到的是新消息，没"已转发自 X"标识。完整聚合转发用 multiForwardMsg
    const store = this.ctx.get('store') as any
    let lastSent: RawMessage | undefined
    for (const msgId of msgIds) {
      const raw = store?.getMsgCache?.(msgId) as RawMessage | undefined
      if (!raw) continue
      const sendElems = await this.rawElementsToSend(raw.elements)
      if (sendElems.length === 0) continue
      lastSent = await this.sendMsg(destPeer, sendElems)
    }
    if (!lastSent) throw new Error(`forwardMsg: no source message in cache for ids=${msgIds.join(',')}`)
    return lastSent
  }

  /** 把 RawMessage.elements 转成 SendMessageElement 数组（forwardMsg 用） */
  private async rawElementsToSend(elements: MessageElement[]): Promise<SendMessageElement[]> {
    const out: SendMessageElement[] = []
    for (const e of elements) {
      if (e.textElement) {
        out.push({ elementType: ElementType.Text, elementId: '', textElement: e.textElement } as any)
      } else if (e.faceElement) {
        out.push({ elementType: ElementType.Face, elementId: '', faceElement: e.faceElement } as any)
      } else if (e.picElement?.sourcePath) {
        out.push(await SendElement.pic(this.ctx, e.picElement.sourcePath))
      } else if (e.videoElement?.filePath) {
        out.push(await SendElement.video(this.ctx, e.videoElement.filePath))
      } else if (e.pttElement?.filePath) {
        out.push(await SendElement.ptt(this.ctx, e.pttElement.filePath))
      } else if (e.arkElement) {
        out.push({ elementType: ElementType.Ark, elementId: '', arkElement: e.arkElement } as any)
      }
      // 其他类型（reply/marketFace 等）转发时 server 不接受外部 client 重构，跳过
    }
    return out
  }

  async forwardMultiMsg(_srcPeer: Peer, _destPeer: Peer, _msgIds: string[]): Promise<RawMessage> {
    throw new Error('forwardMultiMsg 暂未实现 (直连模式)')
  }

  async multiForwardMsg(_srcPeer: Peer, _destPeer: Peer, _msgIds: string[]): Promise<RawMessage> {
    throw new Error('multiForwardMsg 暂未实现 (直连模式)')
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    const seq = +msgSeq
    const decoded = peer.chatType === ChatType.Group
      ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, seq, seq)
      : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, seq, seq)
    return { msgList: this.toRawMessages(decoded, peer.chatType) } as any
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

  async getMsgEmojiLikesList(_peer: Peer, _msgSeq: string, _emojiId: string, _count: number): Promise<any> {
    throw new Error('getMsgEmojiLikesList 暂未实现 (直连模式)')
  }

  async fetchFavEmojiList(_count: number): Promise<any> {
    return { emojiInfoList: [] }
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

  async translatePtt2Text(_msgId: string, _peer: Peer, _voiceMsgElement: MessageElement): Promise<string> {
    throw new Error('translatePtt2Text 暂未实现 (直连模式)')
  }

  async fetchGetHitEmotionsByWord(_word: string, _count: number): Promise<any> {
    return { emotionList: [] }
  }

  async addFavEmoji(_emojiPath: string): Promise<any> {
    throw new Error('addFavEmoji 暂未实现 (直连模式)')
  }

  async deleteFavEmoji(_emojiIds: string[]): Promise<any> {
    throw new Error('deleteFavEmoji 暂未实现 (直连模式)')
  }

  async setContactLocalTop(_peer: Peer, _isTop: boolean): Promise<any> {
    throw new Error('setContactLocalTop 暂未实现 (直连模式)')
  }

  async sendShowInputStatusReq(_chatType: ChatType, _eventType: number, _toUid: string): Promise<any> {
    return { result: 0, errMsg: '' }
  }

  async getPins() {
    return await this.ctx.qqProtocol.fetchPins()
  }
}
