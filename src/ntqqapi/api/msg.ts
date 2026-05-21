import { ChatType, ElementType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { Media, Msg } from '../proto'
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

  async getTempChatInfo(_chatType: ChatType, peerUid: string): Promise<any> {
    // 直连模式没有专门的 OIDB；通过已缓存的群成员反查 peerUid 出现在哪个共同群
    try {
      const sharedGroupCode = (this.ctx.ntGroupApi as any).findSharedGroupByUid?.(peerUid)
      if (sharedGroupCode) {
        return { tmpChatInfo: { groupCode: String(sharedGroupCode), peerUid } }
      }
    } catch {}
    // 没有缓存命中：扫一遍所有群拉成员
    try {
      const groups = await this.ctx.ntGroupApi.getGroups(false)
      for (const g of groups) {
        try {
          const members: any = await this.ctx.ntGroupApi.getGroupMembers(String(g.groupCode))
          if (members.result?.infos?.has(peerUid)) {
            return { tmpChatInfo: { groupCode: String(g.groupCode), peerUid } }
          }
        } catch {}
      }
    } catch {}
    // 没找到任何共同群
    return { tmpChatInfo: {} }
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
        } catch {}
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
        // r.senderUid 是 UID 字符串（如 "u_xxx"），srcMsg.senderUin 需要数字 UIN，需要查一下
        let senderUin = 0
        if (r.senderUid) {
          try {
            const uin = await this.ctx.ntUserApi.getUinByUid(r.senderUid)
            if (uin) senderUin = +uin
          } catch {}
        }
        // srcMsg.elems 是 bytes[] (repeated)，每项是序列化的原 Msg.Elem。
        // 为空时接收端的引用预览只显示空白。从 cache 取原消息，把它的 elements 重新序列化成 Elem bytes
        const srcElems: Buffer[] = []
        try {
          const store = this.ctx.get('store') as any
          const original = r.replayMsgId ? store?.getMsgCache?.(r.replayMsgId) as RawMessage | undefined : undefined
          if (original?.elements?.length) {
            for (const oe of original.elements) {
              if (oe.elementType === ElementType.Text && oe.textElement?.content) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ text: { str: oe.textElement.content } } as any)))
              } else if (oe.elementType === ElementType.Pic) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ text: { str: '[图片]' } } as any)))
              } else if (oe.elementType === ElementType.Face) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ face: { index: oe.faceElement?.faceIndex || 0 } } as any)))
              } else if (oe.elementType === ElementType.Video) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ text: { str: '[视频]' } } as any)))
              } else if (oe.elementType === ElementType.Ptt) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ text: { str: '[语音]' } } as any)))
              } else if (oe.elementType === ElementType.File) {
                srcElems.push(Buffer.from(Msg.Elem.encode({ text: { str: '[文件]' } } as any)))
              }
            }
          }
        } catch (e) {
          this.ctx.logger.warn('build reply srcMsg.elems failed:', (e as Error).message)
        }
        elems.push({
          srcMsg: {
            origSeqs: [+(r.replayMsgSeq ?? 0)],
            senderUin,
            time: +(r.replyMsgTime ?? 0),
            elems: srcElems,
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
          // 群文件 server 端 parentFolderId 不接受 createGroupFolder 返回时带的前导 "/"，
          // 否则它会无视这个值把文件丢到根目录。统一去掉。
          const folderId = (f.folderId ?? '/').replace(/^\/+/, '') || '/'
          const result = await this.ctx.ntFileApi.uploadGroupFile(
            peer.peerUid,
            sourcePath,
            f.fileName,
            folderId,
          )
          // 把 server 返回的 fileId / md5 写回 element，供上层（upload_group_file action）读 fileUuid 返回给客户端
          f.fileUuid = result.fileId
          f.fileMd5 = result.fileMd5
          // 注意：群文件的"发到群聊"是 uploadGroupFile 内部调 0x6d9_4 feed 完成的，
          // 不能再走 PbSendMsg 带 groupFile elem，否则会双发或服务端拒收。这里直接 continue 跳过 elems push。
          continue
        }
        // C2C 文件：upload via 0xe37_1700 + highway，再用 PbSendMsg / trans 0x211 发离线文件消息
        const peerUin = +(await this.ctx.ntUserApi.getUinByUid(peer.peerUid))
        const upRes = await this.ctx.ntFileApi.uploadC2CFile(peer.peerUid, sourcePath, f.fileName)
        f.fileUuid = upRes.fileId
        await this.ctx.qqProtocol.sendC2CFileMessage({
          toUin: peerUin,
          toUid: peer.peerUid,
          fileUuid: upRes.fileId,
          fileName: f.fileName,
          fileSize: upRes.fileSize,
          file10MMd5: upRes.file10MMd5,
          crcMedia: upRes.crcMedia,
        })
        continue
      } else if (elem.elementType === ElementType.Ark) {
        const ark = elem.arkElement
        const json = ark?.bytesData
        if (!json) continue
        // lightApp.data = [0x01] + deflate(jsonBytes)
        const { deflateSync } = await import('node:zlib')
        const data = Buffer.concat([Buffer.from([0x01]), deflateSync(Buffer.from(json, 'utf-8'))])
        elems.push({ lightApp: { data } })
      }
    }

    const isGroup = peer.chatType === ChatType.Group
    // 群文件单独走 0x6d9_4 feed，不会进 elems。如果整条消息只有 File 元素，elems 为空，
    // 这时候不能调 PbSendMsg（server 会拒收空消息）。直接构造 returnMsg 返回。
    if (elems.length === 0) {
      const now = Math.floor(Date.now() / 1000)
      const fakeRandom = Math.floor(Math.random() * 0xffffffff)
      return {
        msgId: String(fakeRandom),
        msgType: 2,
        subMsgType: 0,
        msgTime: String(now),
        msgSeq: '0',
        msgRandom: String(fakeRandom),
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
        elements: msgElements as unknown as MessageElement[],
        peerName: '',
        emojiLikesList: [],
        msgAttrs: new Map(),
        isOnlineMsg: true,
      } as RawMessage
    }
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
      elements: msgElements as unknown as MessageElement[],
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

  async forwardMultiMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    return this.multiForwardMsg(srcPeer, destPeer, msgIds)
  }

  async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    // 从 cache 拉源消息，构造一个聚合转发卡片（com.tencent.multimsg ark）发到 dest
    // 局限：cache 只保留 RawMessage（已解析过），无法 round-trip 原始 wire elem
    // 字节，所以这里只 round-trip text/face；其他元素降级成占位文本
    // （"[图片]" / "[视频]" / "[语音]" 等）。媒体保真转发请走 milky 接口
    const store = this.ctx.get('store') as any
    const isGroupSrc = srcPeer.chatType === ChatType.Group
    const isGroupDest = destPeer.chatType === ChatType.Group
    const messages: any[] = []
    const news: { text: string }[] = []
    let seq = (Date.now() & 0xffff) | 0x10000
    for (const msgId of msgIds) {
      const raw = store?.getMsgCache?.(msgId) as RawMessage | undefined
      if (!raw) continue
      const elems: any[] = []
      let preview = ''
      for (const e of raw.elements) {
        if (e.textElement?.content) {
          elems.push({ text: { str: e.textElement.content } })
          preview += e.textElement.content
        } else if (e.faceElement) {
          elems.push({ face: { index: +(e.faceElement as any).faceIndex || 0 } })
          preview += '[表情]'
        } else if (e.picElement) {
          elems.push({ text: { str: '[图片]' } })
          preview += '[图片]'
        } else if (e.videoElement) {
          elems.push({ text: { str: '[视频]' } })
          preview += '[视频]'
        } else if (e.pttElement) {
          elems.push({ text: { str: '[语音]' } })
          preview += '[语音]'
        } else if (e.arkElement) {
          elems.push({ text: { str: '[卡片]' } })
          preview += '[卡片]'
        }
      }
      if (elems.length === 0) continue
      const senderUin = +(raw.senderUin || selfInfo.uin || 0)
      const senderName = raw.sendNickName || raw.sendMemberName || raw.peerName || String(senderUin)
      messages.push({
        routingHead: {
          fromUin: senderUin,
          c2c: isGroupSrc ? undefined : { friendName: senderName },
          group: isGroupSrc ? { groupCode: +srcPeer.peerUid, groupCard: senderName } : undefined,
        },
        contentHead: {
          msgType: isGroupSrc ? 82 : 9,
          random: Math.floor(Math.random() * 0xfffffff0),
          msgSeq: seq++,
          msgTime: +raw.msgTime || Math.trunc(Date.now() / 1000),
          pkgNum: 1, pkgIndex: 0, divSeq: 0,
          forward: { field1: 0, field2: 0, field3: 0, field4: '', avatar: '' },
        },
        body: { richText: { elems } },
      })
      if (news.length < 4) news.push({ text: `${senderName}: ${preview.slice(0, 70)}` })
    }
    if (messages.length === 0) {
      throw new Error(`multiForwardMsg: no source message in cache for ids=${msgIds.join(',')}`)
    }
    const destPeerUid = destPeer.peerUid
    const destIsGroup = isGroupDest
    const resid = await this.ctx.qqProtocol.uploadForward(destPeerUid, destIsGroup, [
      { fileName: 'MultiMsg', buffer: { msg: messages } },
    ])
    const uniseq = require('node:crypto').randomUUID() as string
    const arkJson = JSON.stringify({
      app: 'com.tencent.multimsg',
      config: { autosize: 1, forward: 1, round: 1, type: 'normal', width: 300 },
      desc: '[聊天记录]',
      extra: JSON.stringify({ filename: uniseq, tsum: messages.length }),
      meta: {
        detail: {
          news,
          resid,
          source: destIsGroup ? '群聊的聊天记录' : '聊天记录',
          summary: `查看${messages.length}条转发消息`,
          uniseq,
        },
      },
      prompt: '[聊天记录]',
      ver: '0.0.0.5',
      view: 'contact',
    })
    const arkElem: any = {
      elementType: ElementType.Ark,
      elementId: '',
      arkElement: { bytesData: arkJson },
    }
    return await this.sendMsg(destPeer, [arkElem])
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

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, count: number): Promise<any> {
    const r = await this.ctx.qqProtocol.fetchMsgEmojiLikes(+peer.peerUid, +msgSeq, emojiId, count)
    const emojiLikesList = await Promise.all(r.users.map(async (u: any) => ({
      uid: await this.ctx.ntUserApi.getUidByUin(String(u.uin), peer.peerUid).catch(() => ''),
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
    return { result: 0, errMsg: '', emojiInfoList: [] }
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
}
