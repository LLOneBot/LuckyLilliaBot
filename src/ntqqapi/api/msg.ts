import { invoke, NTMethod } from '../ntcall'
import { RawMessage, SendMessageElement, Peer, ChatType } from '../types'
import { Service, Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'

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
    return await invoke('nodeIKernelMsgService/getTempChatInfo', [{ chatType, peerUid }])
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean) {
    // nt_qq/global/nt_data/Emoji/emoji-resource/sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq/global/nt_data/Emoji/emoji-resource/face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    const emojiType = emojiId.length > 3 ? '2' : '1'
    return await invoke(NTMethod.EMOJI_LIKE, [{ peer, msgSeq, emojiId, emojiType, setEmoji }])
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    return await invoke(NTMethod.GET_MULTI_MSG, [{ peer, rootMsgId, parentMsgId }])
  }

  async activateChat(peer: Peer) {
    return await invoke(NTMethod.ACTIVE_CHAT_PREVIEW, [{ peer, cnt: 1 }])
  }

  async activateChatAndGetHistory(peer: Peer, cnt: number) {
    // 消息从旧到新
    return await invoke(NTMethod.ACTIVE_CHAT_HISTORY, [{ peer, cnt, msgId: '0', queryOrder: true }])
  }

  async getAioFirstViewLatestMsgs(peer: Peer, cnt: number) {
    return await invoke('nodeIKernelMsgService/getAioFirstViewLatestMsgs', [{ peer, cnt }])
  }

  async getMsgsByMsgId(peer: Peer, msgIds: string[]) {
    if (!peer) throw new Error('peer is not allowed')
    if (!msgIds) throw new Error('msgIds is not allowed')
    return await invoke('nodeIKernelMsgService/getMsgsByMsgId', [{ peer, msgIds }])
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, queryOrder = false) {
    // 默认情况下消息时间从旧到新
    return await invoke(NTMethod.HISTORY_MSG, [{ peer, msgId, cnt, queryOrder }])
  }

  async recallMsg(peer: Peer, msgIds: string[]) {
    return await invoke(NTMethod.RECALL_MSG, [{ peer, msgIds }])
  }

  async sendMsg(peer: Peer, msgElements: SendMessageElement[], timeout = 10000) {
    const uniqueId = await this.generateMsgUniqueId(peer.chatType)
    peer.guildId = uniqueId
    const data = await invoke<{ msgList: RawMessage[] }>(
      'nodeIKernelMsgService/sendMsg',
      [{
        msgId: '0',
        peer,
        msgElements,
        msgAttributeInfos: new Map()
      }],
      {
        cbCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        afterFirstCmd: false,
        cmdCB: payload => {
          for (const msgRecord of payload.msgList) {
            if (msgRecord.guildId === uniqueId && msgRecord.sendStatus === 2) {
              return true
            }
          }
          return false
        },
        timeout
      }
    )
    delete peer.guildId
    return data.msgList.find(msgRecord => msgRecord.guildId === uniqueId)
  }

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const uniqueId = await this.generateMsgUniqueId(destPeer.chatType)
    destPeer.guildId = uniqueId
    const data = await invoke<{ msgList: RawMessage[] }>(
      'nodeIKernelMsgService/forwardMsg',
      [{
        msgIds,
        srcContact: srcPeer,
        dstContacts: [destPeer],
        commentElements: [],
        msgAttributeInfos: new Map(),
      }],
      {
        cbCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        afterFirstCmd: false,
        cmdCB: payload => {
          for (const msgRecord of payload.msgList) {
            if (msgRecord.guildId === uniqueId && msgRecord.sendStatus === 2) {
              return true
            }
          }
          return false
        }
      }
    )
    delete destPeer.guildId
    return data.msgList.filter(msgRecord => msgRecord.guildId === uniqueId)
  }

  async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    const senderShowName = await this.ctx.ntUserApi.getSelfNick(true)
    const msgInfos = msgIds.map(id => {
      return { msgId: id, senderShowName }
    })
    const selfUid = selfInfo.uid
    const data = await invoke<{ msgList: RawMessage[] }>(
      'nodeIKernelMsgService/multiForwardMsgWithComment',
      [{
        msgInfos,
        srcContact: srcPeer,
        dstContact: destPeer,
        commentElements: [],
        msgAttributeInfos: new Map(),
      }],
      {
        cbCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        afterFirstCmd: false,
        cmdCB: payload => {
          for (const msgRecord of payload.msgList) {
            if (msgRecord.peerUid === destPeer.peerUid && msgRecord.senderUid === selfUid) {
              return true
            }
          }
          return false
        }
      }
    )
    for (const msg of data.msgList) {
      const arkElement = msg.elements.find(ele => ele.arkElement)
      if (!arkElement) {
        continue
      }
      const forwardData = JSON.parse(arkElement.arkElement!.bytesData)
      if (forwardData.app !== 'com.tencent.multimsg') {
        continue
      }
      if (msg.peerUid === destPeer.peerUid && msg.senderUid === selfUid) {
        return msg
      }
    }
    throw new Error('转发消息超时')
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    return await invoke('nodeIKernelMsgService/getSingleMsg', [{ peer, msgSeq }])
  }

  async queryFirstMsgBySeq(peer: Peer, msgSeq: string) {
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [{
      msgId: '0',
      msgTime: '0',
      msgSeq,
      params: {
        chatInfo: peer,
        filterMsgType: [],
        filterSendersUid: [],
        filterMsgToTime: '0',
        filterMsgFromTime: '0',
        isReverseOrder: true,
        isIncludeCurrent: true,
        pageLimit: 1,
      }
    }])
  }

  async queryMsgsWithFilterExBySeq(peer: Peer, msgSeq: string, filterMsgTime: string, filterSendersUid: string[] = []) {
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [{
      msgId: '0',
      msgTime: '0',
      msgSeq,
      params: {
        chatInfo: peer,
        filterMsgType: [],
        filterSendersUid,
        filterMsgToTime: filterMsgTime,
        filterMsgFromTime: filterMsgTime,
        isReverseOrder: true,
        isIncludeCurrent: true,
        pageLimit: 1,
      }
    }])
  }

  async setMsgRead(peer: Peer) {
    return await invoke('nodeIKernelMsgService/setMsgRead', [{ peer }])
  }

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, emojiType: string, count: number) {
    return await invoke('nodeIKernelMsgService/getMsgEmojiLikesList', [{
      peer,
      msgSeq,
      emojiId,
      emojiType,
      cnt: count
    }])
  }

  async fetchFavEmojiList(count: number) {
    return await invoke('nodeIKernelMsgService/fetchFavEmojiList', [{
      resId: '',
      count,
      backwardFetch: true,
      forceRefresh: true
    }])
  }

  async generateMsgUniqueId(chatType: number) {
    const time = await this.getServerTime()
    const uniqueId = await invoke('nodeIKernelMsgService/generateMsgUniqueId', [{ chatType, time }])
    if (typeof uniqueId === 'string') {
      return uniqueId
    } else {
      const random = Math.trunc(Math.random() * 100)
      return `${Date.now()}${random}`
    }
  }

  async queryMsgsById(chatType: ChatType, msgId: string) {
    const msgTime = this.getMsgTimeFromId(msgId)
    return await invoke('nodeIKernelMsgService/queryMsgsWithFilterEx', [{
      msgId,
      msgTime: '0',
      msgSeq: '0',
      params: {
        chatInfo: {
          peerUid: '',
          chatType
        },
        filterMsgToTime: msgTime,
        filterMsgFromTime: msgTime,
        isIncludeCurrent: true,
        pageLimit: 1,
      }
    }])
  }

  getMsgTimeFromId(msgId: string) {
    // 小概率相差1毫秒
    return String(BigInt(msgId) >> 32n)
  }

  async getServerTime() {
    return await invoke('nodeIKernelMSFService/getServerTime', [])
  }

  async fetchUnitedCommendConfig(groups: string[]) {
    return await invoke('nodeIKernelUnitedConfigService/fetchUnitedCommendConfig', [{ groups }])
  }
}
