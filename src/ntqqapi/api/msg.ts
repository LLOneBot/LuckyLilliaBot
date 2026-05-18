import { NTMethod } from '../ntcall'
import { ChatType, ElementType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { ReceiveCmdS } from '@/ntqqapi/hook'
import { Media } from '../proto'

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

  async getTempChatInfo(chatType: ChatType, peerUid: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getTempChatInfo', [chatType, peerUid])
  }

  private getEmojiIdType(emojiId: string) {
    // https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    return emojiId.length > 3 ? '2' : '1'
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean, emojiType?: string) {
    // nt_qq/global/nt_data/Emoji/emoji-resource/sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq/global/nt_data/Emoji/emoji-resource/face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    return await this.ctx.qqProtocol.invoke(NTMethod.EMOJI_LIKE, [peer, msgSeq, emojiId, emojiType ?? this.getEmojiIdType(emojiId), setEmoji])
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    return await this.ctx.qqProtocol.invoke(NTMethod.GET_MULTI_MSG, [peer, rootMsgId, parentMsgId])
  }

  async activateChat(peer: Peer) {
    return await this.ctx.qqProtocol.invoke(NTMethod.ACTIVE_CHAT_PREVIEW, [peer, 0])
  }

  async activateChatAndGetHistory(peer: Peer, cnt: number) {
    // 消息从旧到新
    return await this.ctx.qqProtocol.invoke(NTMethod.ACTIVE_CHAT_HISTORY, [peer, cnt, '0', true])
  }

  async getAioFirstViewLatestMsgs(peer: Peer, cnt: number) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getAioFirstViewLatestMsgs', [peer, cnt])
  }

  async getMsgsByMsgId(peer: Peer, msgIds: string[]) {
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getMsgsByMsgId', [peer, msgIds])
    } catch {
      // 直连模式 fallback: 从消息缓存查
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
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, queryOrder = false) {
    // 默认情况下消息时间从新到旧
    return await this.ctx.qqProtocol.invoke(NTMethod.HISTORY_MSG, [peer, msgId, cnt, queryOrder])
  }

  async recallMsg(peer: Peer, msgIds: string[]) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.RECALL_MSG, [peer, msgIds])
    } catch {
      // 直连模式 fallback: 从缓存查 seq/random 然后调 OIDB 撤回
      const store = this.ctx.get('store') as any
      const isGroup = peer.chatType === ChatType.Group
      for (const id of msgIds) {
        const msg = store?.getMsgCache?.(id) as RawMessage | undefined
        if (!msg) continue
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
    }
  }

  async sendMsg(peer: Peer, msgElements: SendMessageElement[]) {
    // 计算发送的文件大小
    let totalSize = 0
    for (const fileElement of msgElements) {
      if (fileElement.elementType === ElementType.Ptt) {
        totalSize += +fileElement.pttElement.fileSize!
      }
      else if (fileElement.elementType === ElementType.File) {
        totalSize += +fileElement.fileElement.fileSize!
      }
      else if (fileElement.elementType === ElementType.Video) {
        totalSize += +fileElement.videoElement.fileSize!
      }
      else if (fileElement.elementType === ElementType.Pic) {
        totalSize += +fileElement.picElement.fileSize!
      }
    }
    const timeout = 10000 + (totalSize / 1024 / 256 * 1000)  // 10s Basic Timeout + PredictTime( For File 512kb/s )

    const uniqueId = await this.generateMsgUniqueId(peer.chatType)
    const msgAttributeInfos = new Map()
    msgAttributeInfos.set(0, {
      attrType: 0,
      attrId: uniqueId,
      vasMsgInfo: {
        msgNamePlateInfo: {},
        bubbleInfo: {},
        avatarPendantInfo: {},
        vasFont: {},
        iceBreakInfo: {},
      },
    })

    try {
      let sentMsgId: string
      const data = await this.ctx.qqProtocol.invoke(
        'nodeIKernelMsgService/sendMsg',
        [
          '0',
          peer,
          msgElements,
          msgAttributeInfos,
        ],
        {
          resultCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
          resultCb: payload => {
            for (const msgRecord of payload) {
              if (msgRecord.msgAttrs.get(0)?.attrId === uniqueId && msgRecord.sendStatus === 2) {
                sentMsgId = msgRecord.msgId
                return true
              }
            }
            return false
          },
          timeout,
        },
      )
      return data.find(msgRecord => msgRecord.msgId === sentMsgId)!
    } catch {
      // 直连模式 fallback：转换 SendMessageElement[] 为 protobuf Elem[] 并通过 PbSendMsg 发送
      return await this.sendMsgViaPbSendMsg(peer, msgElements)
    }
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
          // @全体成员
          const attr6 = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x05, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])
          elems.push({ text: { str: t.content || '@全体成员', attr6Buf: attr6 } })
        } else if (t.atType === 2 /* AtType.One */) {
          // @某人
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
        const msgInfoBytes = Media.MsgInfo.encode(result.msgInfo)
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
          ? await this.ctx.ntFileApi.uploadGroupVideo(peer.peerUid, sourcePath, thumbPath)
          : await this.ctx.ntFileApi.uploadC2CVideo(peer.peerUid, sourcePath, thumbPath)
        const msgInfoBytes = Media.MsgInfo.encode(result.msgInfo)
        elems.push({
          commonElem: {
            serviceType: 48,
            pbElem: Buffer.from(msgInfoBytes),
            businessType: isGroup ? 21 : 11,
          }
        })
      } else if (elem.elementType === ElementType.Ptt) {
        const p = elem.pttElement
        const sourcePath = p.filePath
        if (!sourcePath) continue
        const isGroup = peer.chatType === ChatType.Group
        const result = isGroup
          ? await this.ctx.ntFileApi.uploadGroupPtt(peer.peerUid, sourcePath, p.duration ?? 1)
          : await this.ctx.ntFileApi.uploadC2CPtt(peer.peerUid, sourcePath, p.duration ?? 1)
        const msgInfoBytes = Media.MsgInfo.encode(result.msgInfo)
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
          // 群文件上传成功后通过 groupFile element 发送
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

    // 构造一个最小的 RawMessage 返回（满足上层接口）
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

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const uniqueId = await this.generateMsgUniqueId(destPeer.chatType)
    destPeer.guildId = uniqueId
    const msgAttributeInfos = new Map()
    const data = await this.ctx.qqProtocol.invoke(
      'nodeIKernelMsgService/forwardMsgWithComment',
      [
        msgIds,
        srcPeer,
        [destPeer],
        [],
        msgAttributeInfos,
      ],
      {
        resultCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        resultCb: payload => {
          for (const msgRecord of payload) {
            if (msgRecord.guildId === uniqueId && msgRecord.sendStatus === 2) {
              return true
            }
          }
          return false
        },
        timeout: 3000,
      },
    )
    destPeer.guildId = ''
    return data.find(msgRecord => msgRecord.guildId === uniqueId)!
  }

  async forwardMultiMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const data = await this.ctx.qqProtocol.invoke(
      'nodeIKernelMsgService/forwardMsgWithComment',
      [
        msgIds,
        srcPeer,
        [destPeer],
        [],
        new Map(),
      ],
      {
        resultCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        resultCb: payload => {
          for (const msgRecord of payload) {
            if (
              msgRecord.msgType === 11 &&
              msgRecord.subMsgType === 7 &&
              msgRecord.peerUid === destPeer.peerUid &&
              msgRecord.senderUid === selfInfo.uid
            ) {
              const element = msgRecord.elements[0]
              const data = JSON.parse(element.arkElement!.bytesData)
              if (data.app !== 'com.tencent.multimsg' || !data.meta.detail.resid) {
                continue
              }
              return true
            }
          }
          return false
        },
        timeout: 3000,
      },
    )
    return data.find(msgRecord => {
      if (
        msgRecord.msgType === 11 &&
        msgRecord.subMsgType === 7 &&
        msgRecord.peerUid === destPeer.peerUid &&
        msgRecord.senderUid === selfInfo.uid
      ) {
        const element = msgRecord.elements[0]
        const data = JSON.parse(element.arkElement!.bytesData)
        if (data.app !== 'com.tencent.multimsg' || !data.meta.detail.resid) {
          return false
        }
        return true
      }
      return false
    })!
  }

  async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    const senderShowName = await this.ctx.ntUserApi.getSelfNick(false)
    const msgInfos = msgIds.map(id => {
      return { msgId: id, senderShowName }
    })
    const msgAttributeInfos = new Map()
    const data = await this.ctx.qqProtocol.invoke(
      'nodeIKernelMsgService/multiForwardMsgWithComment',
      [
        msgInfos,
        srcPeer,
        destPeer,
        [],
        msgAttributeInfos,
      ],
      {
        resultCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        resultCb: payload => {
          for (const msgRecord of payload) {
            if (
              msgRecord.msgType === 11 &&
              msgRecord.subMsgType === 7 &&
              msgRecord.peerUid === destPeer.peerUid &&
              msgRecord.senderUid === selfInfo.uid
            ) {
              const element = msgRecord.elements[0]
              const data = JSON.parse(element.arkElement!.bytesData)
              if (data.app !== 'com.tencent.multimsg' || !data.meta.detail.resid) {
                continue
              }
              return true
            }
          }
          return false
        },
      },
    )
    return data.find(msgRecord => {
      if (
        msgRecord.msgType === 11 &&
        msgRecord.subMsgType === 7 &&
        msgRecord.peerUid === destPeer.peerUid &&
        msgRecord.senderUid === selfInfo.uid
      ) {
        const element = msgRecord.elements[0]
        const data = JSON.parse(element.arkElement!.bytesData)
        if (data.app !== 'com.tencent.multimsg' || !data.meta.detail.resid) {
          return false
        }
        return true
      }
      return false
    })!
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getSingleMsg', [peer, msgSeq])
    } catch {
      // 直连模式 fallback: 用 SsoGetGroupMsg / SsoGetC2CMsg 拉单条
      const seq = +msgSeq
      const messages = peer.chatType === ChatType.Group
        ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, seq, seq)
        : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, seq, seq)
      return { msgList: messages } as any
    }
  }

  async queryFirstMsgBySeq(peer: Peer, msgSeq: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
      '0', // msgId
      '0', // msgTime
      msgSeq,
      {
        chatInfo: peer,
        filterMsgType: [],
        filterSendersUid: [],
        filterMsgToTime: '0',
        filterMsgFromTime: '0',
        isReverseOrder: true,
        isIncludeCurrent: true,
        pageLimit: 1,
      },
    ])
  }

  async queryMsgsWithFilterExBySeq(peer: Peer, msgSeq: string, filterMsgTime: string, filterSendersUid: string[]) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
      '0',
      '0',
      msgSeq,
      {
        chatInfo: peer,
        filterMsgType: [],
        filterSendersUid,
        filterMsgToTime: String(filterMsgTime + 1),  // 获取到的消息时间可能比 replyMsgTime 多一毫秒
        filterMsgFromTime: filterMsgTime,
        isReverseOrder: true,
        isIncludeCurrent: true,
        pageLimit: 1,
      },
    ])
  }

  async setMsgRead(peer: Peer) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/setMsgRead', [peer])
  }

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, count: number) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getMsgEmojiLikesList', [
      peer,
      msgSeq,
      emojiId,
      this.getEmojiIdType(emojiId),
      '',
      false,
      count,
    ])
  }

  async fetchFavEmojiList(count: number) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/fetchFavEmojiList', [
      '', // resId
      count,
      true, // backwardFetch
      true, // forceRefresh
    ])
  }

  async generateMsgUniqueId(chatType: number) {
    const time = await this.getServerTime()
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/generateMsgUniqueId', [chatType, time])
  }

  async queryMsgsById(chatType: ChatType, msgId: string) {
    const msgTime = this.getMsgTimeFromId(msgId)
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
      msgId,
      '0',
      '0',
      {
        chatInfo: {
          chatType,
          peerUid: '',
          guildId: ''
        },
        filterMsgToTime: msgTime,
        filterMsgFromTime: msgTime,
        isIncludeCurrent: true,
        pageLimit: 1,
      },
    ])
  }

  getMsgTimeFromId(msgId: string) {
    // 小概率相差1毫秒
    return String(BigInt(msgId) >> 32n)
  }

  async getServerTime() {
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelMSFService/getServerTime', [])
    } catch {
      // 直连模式：使用本地时间（秒）
      return String(Math.floor(Date.now() / 1000))
    }
  }

  async getMsgsBySeqAndCount(peer: Peer, msgSeq: string, cnt: number, queryOrder: boolean, includeDeleteMsg: boolean) {
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getMsgsBySeqAndCount', [
        peer,
        msgSeq,
        cnt,
        queryOrder,
        includeDeleteMsg,
      ],
        {
          timeout: Math.max(1000 * cnt, 3000),
        })
    } catch (e) {
      // 直连模式 fallback: 用 SsoGetGroupMsg/SsoGetC2CMsg 按 seq 范围拉
      try {
        const start = +msgSeq
        const end = queryOrder ? start + cnt - 1 : start
        const startSeq = queryOrder ? start : Math.max(1, start - cnt + 1)
        const endSeq = queryOrder ? end : start
        const messages = peer.chatType === ChatType.Group
          ? await this.ctx.qqProtocol.getGroupMessages(+peer.peerUid, startSeq, endSeq)
          : await this.ctx.qqProtocol.getC2CMessages(peer.peerUid, startSeq, endSeq)
        return { msgList: messages } as any
      } catch {
        this.ctx.logger.error('getMsgsBySeqAndCount fallback failed', e)
        return { msgList: [] }
      }
    }
  }

  async getSourceOfReplyMsgByClientSeqAndTime(peer: Peer, clientSeq: string, msgTime: string, sourceMsgIdInRecords: string) {
    // sourceMsgIdInRecord
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/getSourceOfReplyMsgByClientSeqAndTime', [peer, clientSeq, msgTime, sourceMsgIdInRecords])
  }

  async translatePtt2Text(msgId: string, peer: Peer, voiceMsgElement: MessageElement) {
    const res = await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/translatePtt2Text', [msgId, peer, voiceMsgElement],
      {
        resultCmd: ReceiveCmdS.UPDATE_MSG,
        resultCb: (msgList: RawMessage[]) => {
          const voiceMsg = msgList[0]
          if (voiceMsg && voiceMsg.msgId === msgId && voiceMsg.elements.length > 0) {
            const pttElement = voiceMsg.elements[0].pttElement
            if (pttElement && pttElement.text) {
              return true
            }
          }
          return false
        },
      },
    )
    return res[0]?.elements[0]?.pttElement?.text || ''
  }

  async fetchGetHitEmotionsByWord(word: string, count: number) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/fetchGetHitEmotionsByWord', [{
      word,
      uid: selfInfo.uid,
      count,
      age: 0,
      gender: 1,
      uiVersion: '',
    }])
  }

  async addFavEmoji(emojiPath: string) {
    const fs = await import('fs')
    const path = await import('path')
    const crypto = await import('crypto')

    const stat = fs.statSync(emojiPath)
    const fileSize = String(stat.size)
    const fileName = path.basename(emojiPath).toUpperCase()
    const fileBuffer = fs.readFileSync(emojiPath)
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex')

    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/addFavEmoji', [{
      isMarkFace: false,
      emojiPath,
      fileSize,
      fileName,
      md5,
      isOrigin: true,
      emojiId: '',
      packageId: 0,
    }])
  }

  async deleteFavEmoji(emojiIds: string[]) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/deleteFavEmoji', [emojiIds])
  }

  async setContactLocalTop(peer: Peer, isTop: boolean) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/setContactLocalTop', [peer, isTop])
  }

  async sendShowInputStatusReq(chatType: ChatType, eventType: number, toUid: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelMsgService/sendShowInputStatusReq', [chatType, eventType, toUid])
  }

  async getPins() {
    return await this.ctx.qqProtocol.fetchPins()
  }
}
