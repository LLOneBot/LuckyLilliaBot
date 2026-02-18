import { invoke, NTMethod } from '../ntcall'
import { ChatType, MessageElement, Peer, RawMessage, SendMessageElement } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { ReceiveCmdS } from '@/ntqqapi/hook'

declare module 'cordis' {
  interface Context {
    ntMsgApi: NTQQMsgApi
  }
}

export class NTQQMsgApi extends Service {
  static inject = ['ntUserApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntMsgApi', true)
  }

  async getTempChatInfo(chatType: ChatType, peerUid: string) {
    return await invoke('nodeIKernelMsgService/getTempChatInfo', [chatType, peerUid])
  }

  private getEmojiIdType(emojiId: string) {
    // https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    return emojiId.length > 3 ? '2' : '1'
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean, emojiType?: string) {
    // nt_qq/global/nt_data/Emoji/emoji-resource/sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq/global/nt_data/Emoji/emoji-resource/face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    return await invoke(NTMethod.EMOJI_LIKE, [peer, msgSeq, emojiId, emojiType ?? this.getEmojiIdType(emojiId), setEmoji])
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    return await invoke(NTMethod.GET_MULTI_MSG, [peer, rootMsgId, parentMsgId])
  }

  async activateChat(peer: Peer) {
    return await invoke(NTMethod.ACTIVE_CHAT_PREVIEW, [peer, 0])
  }

  async activateChatAndGetHistory(peer: Peer, cnt: number) {
    // 消息从旧到新
    return await invoke(NTMethod.ACTIVE_CHAT_HISTORY, [peer, cnt, '0', true])
  }

  async getAioFirstViewLatestMsgs(peer: Peer, cnt: number) {
    return await invoke('nodeIKernelMsgService/getAioFirstViewLatestMsgs', [peer, cnt])
  }

  async getMsgsByMsgId(peer: Peer, msgIds: string[]) {
    return await invoke('nodeIKernelMsgService/getMsgsByMsgId', [peer, msgIds])
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, queryOrder = false) {
    // 默认情况下消息时间从新到旧
    return await invoke(NTMethod.HISTORY_MSG, [peer, msgId, cnt, queryOrder])
  }

  async recallMsg(peer: Peer, msgIds: string[]) {
    return await invoke(NTMethod.RECALL_MSG, [peer, msgIds])
  }

  async sendMsg(peer: Peer, msgElements: SendMessageElement[], timeout = 10000) {
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

    let sentMsgId: string
    const data = await invoke(
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
  }

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const uniqueId = await this.generateMsgUniqueId(destPeer.chatType)
    destPeer.guildId = uniqueId
    const msgAttributeInfos = new Map()
    const data = await invoke(
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
    const data = await invoke(
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
    const data = await invoke(
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
    return await invoke('nodeIKernelMsgService/getSingleMsg', [peer, msgSeq])
  }

  async queryFirstMsgBySeq(peer: Peer, msgSeq: string) {
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
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
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
      '0',
      '0',
      msgSeq,
      {
        chatInfo: peer,
        filterMsgType: [],
        filterSendersUid,
        filterMsgToTime: filterMsgTime,
        filterMsgFromTime: filterMsgTime,
        isReverseOrder: false,
        isIncludeCurrent: true,
        pageLimit: 1,
      },
    ])
  }

  async setMsgRead(peer: Peer) {
    return await invoke('nodeIKernelMsgService/setMsgRead', [peer])
  }

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, count: number) {
    return await invoke('nodeIKernelMsgService/getMsgEmojiLikesList', [
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
    return await invoke('nodeIKernelMsgService/fetchFavEmojiList', [
      '', // resId
      count,
      true, // backwardFetch
      true, // forceRefresh
    ])
  }

  async generateMsgUniqueId(chatType: number) {
    const time = await this.getServerTime()
    return await invoke('nodeIKernelMsgService/generateMsgUniqueId', [chatType, time])
  }

  async queryMsgsById(chatType: ChatType, msgId: string) {
    const msgTime = this.getMsgTimeFromId(msgId)
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [
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
    return await invoke('nodeIKernelMSFService/getServerTime', [])
  }

  async getMsgsBySeqAndCount(peer: Peer, msgSeq: string, cnt: number, queryOrder: boolean, includeDeleteMsg: boolean) {
    try {
      return await invoke('nodeIKernelMsgService/getMsgsBySeqAndCount', [
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
      this.ctx.logger.error('getMsgsBySeqAndCount error', e)
      return { msgList: [] }
    }
  }

  async getSourceOfReplyMsgByClientSeqAndTime(peer: Peer, clientSeq: string, msgTime: string, sourceMsgIdInRecords: string) {
    // sourceMsgIdInRecord
    return await invoke('nodeIKernelMsgService/getSourceOfReplyMsgByClientSeqAndTime', [peer, clientSeq, msgTime, sourceMsgIdInRecords])
  }

  async translatePtt2Text(msgId: string, peer: Peer, voiceMsgElement: MessageElement) {
    const res = await invoke('nodeIKernelMsgService/translatePtt2Text', [msgId, peer, voiceMsgElement],
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
    return await invoke('nodeIKernelMsgService/fetchGetHitEmotionsByWord', [{
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

    return await invoke('nodeIKernelMsgService/addFavEmoji', [{
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
    return await invoke('nodeIKernelMsgService/deleteFavEmoji', [emojiIds])
  }

  async setContactLocalTop(peer: Peer, isTop: boolean) {
    return await invoke('nodeIKernelMsgService/setContactLocalTop', [peer, isTop])
  }
}
