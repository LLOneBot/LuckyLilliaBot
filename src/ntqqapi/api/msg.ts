import { invoke, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { RawMessage, SendMessageElement, Peer, ChatType } from '../types'
import { getSession } from '@/ntqqapi/wrapper'
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
    const session = getSession()
    if (session) {
      return session.getMsgService().getTempChatInfo(chatType, peerUid)
    } else {
      return await invoke('nodeIKernelMsgService/getTempChatInfo', [{ chatType, peerUid }, null])
    }
  }

  async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, setEmoji: boolean = true) {
    // nt_qq//global//nt_data//Emoji//emoji-resource//sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq\global\nt_data\Emoji\emoji-resource\face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    const session = getSession()
    const emojiType = emojiId.length > 3 ? '2' : '1'
    if (session) {
      return session.getMsgService().setMsgEmojiLikes(peer, msgSeq, emojiId, emojiType, setEmoji)
    } else {
      return await invoke(NTMethod.EMOJI_LIKE, [{ peer, msgSeq, emojiId, emojiType, setEmoji }, null])
    }
  }

  async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    const session = getSession()
    if (session) {
      return session.getMsgService().getMultiMsg(peer, rootMsgId, parentMsgId)
    } else {
      return await invoke(NTMethod.GET_MULTI_MSG, [{ peer, rootMsgId, parentMsgId }, null])
    }
  }

  async activateChat(peer: Peer) {
    return await invoke<GeneralCallResult>(NTMethod.ACTIVE_CHAT_PREVIEW, [{ peer, cnt: 1 }, null])
  }

  async activateChatAndGetHistory(peer: Peer) {
    return await invoke<GeneralCallResult>(NTMethod.ACTIVE_CHAT_HISTORY, [{ peer, cnt: 20 }, null])
  }

  async getAioFirstViewLatestMsgs(peer: Peer, cnt: number) {
    return await invoke('nodeIKernelMsgService/getAioFirstViewLatestMsgs', [{ peer, cnt }, null])
  }

  async getMsgsByMsgId(peer: Peer | undefined, msgIds: string[] | undefined) {
    if (!peer) throw new Error('peer is not allowed')
    if (!msgIds) throw new Error('msgIds is not allowed')
    const session = getSession()
    if (session) {
      return session.getMsgService().getMsgsByMsgId(peer, msgIds)
    } else {
      return await invoke('nodeIKernelMsgService/getMsgsByMsgId', [{ peer, msgIds }, null])
    }
  }

  async getMsgHistory(peer: Peer, msgId: string, cnt: number, isReverseOrder: boolean = false) {
    const session = getSession()
    // 消息时间从旧到新
    if (session) {
      return session.getMsgService().getMsgsIncludeSelf(peer, msgId, cnt, isReverseOrder)
    } else {
      return await invoke(NTMethod.HISTORY_MSG, [{ peer, msgId, cnt, queryOrder: isReverseOrder }, null])
    }
  }

  async recallMsg(peer: Peer, msgIds: string[]) {
    const session = getSession()
    if (session) {
      return session.getMsgService().recallMsg(peer, msgIds)
    } else {
      return await invoke(NTMethod.RECALL_MSG, [{ peer, msgIds }, null])
    }
  }

  async sendMsg(peer: Peer, msgElements: SendMessageElement[], timeout = 10000) {
    const msgId = await this.generateMsgUniqueId(peer.chatType)
    peer.guildId = msgId
    const data = await invoke<{ msgList: RawMessage[] }>(
      'nodeIKernelMsgService/sendMsg',
      [
        {
          msgId: '0',
          peer,
          msgElements,
          msgAttributeInfos: new Map()
        },
        null
      ],
      {
        cbCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        afterFirstCmd: false,
        cmdCB: payload => {
          for (const msgRecord of payload.msgList) {
            if (msgRecord.guildId === msgId && msgRecord.sendStatus === 2) {
              return true
            }
          }
          return false
        },
        timeout
      }
    )
    return data.msgList.find(msgRecord => msgRecord.guildId === msgId)
  }

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const session = getSession()
    if (session) {
      return session.getMsgService().forwardMsg(msgIds, srcPeer, [destPeer], [])
    } else {
      return await invoke(NTMethod.FORWARD_MSG, [{
        msgIds,
        srcContact: srcPeer,
        dstContacts: [destPeer],
        commentElements: [],
        msgAttributeInfos: new Map(),
      }, null])
    }
  }

  async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    const senderShowName = await this.ctx.ntUserApi.getSelfNick(true)
    const msgInfos = msgIds.map(id => {
      return { msgId: id, senderShowName }
    })
    const selfUid = selfInfo.uid
    const data = await invoke<{ msgList: RawMessage[] }>(
      'nodeIKernelMsgService/multiForwardMsgWithComment',
      [
        {
          msgInfos,
          srcContact: srcPeer,
          dstContact: destPeer,
          commentElements: [],
          msgAttributeInfos: new Map(),
        },
        null,
      ],
      {
        cbCmd: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
        afterFirstCmd: false,
        cmdCB: payload => {
          for (const msgRecord of payload.msgList) {
            if (msgRecord.peerUid == destPeer.peerUid && msgRecord.senderUid == selfUid) {
              return true
            }
          }
          return false
        },
      }
    )
    for (const msg of data.msgList) {
      const arkElement = msg.elements.find(ele => ele.arkElement)
      if (!arkElement) {
        continue
      }
      const forwardData = JSON.parse(arkElement.arkElement!.bytesData)
      if (forwardData.app != 'com.tencent.multimsg') {
        continue
      }
      if (msg.peerUid == destPeer.peerUid && msg.senderUid == selfUid) {
        return msg
      }
    }
    throw new Error('转发消息超时')
  }

  async getMsgsBySeqAndCount(peer: Peer, msgSeq: string, count: number, desc: boolean, z: boolean) {
    const session = getSession()
    if (session) {
      return await session.getMsgService().getMsgsBySeqAndCount(peer, msgSeq, count, desc, z)
    } else {
      return await invoke('nodeIKernelMsgService/getMsgsBySeqAndCount', [{
        peer,
        cnt: count,
        msgSeq,
        queryOrder: desc
      }, null])
    }
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    const session = getSession()
    if (session) {
      return await session.getMsgService().getSingleMsg(peer, msgSeq)
    } else {
      return await invoke('nodeIKernelMsgService/getSingleMsg', [{ peer, msgSeq }, null])
    }
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
    }, null])
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
    }, null])
  }

  async setMsgRead(peer: Peer) {
    return await invoke('nodeIKernelMsgService/setMsgRead', [{ peer }, null])
  }

  async getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, emojiType: string, count: number) {
    return await invoke('nodeIKernelMsgService/getMsgEmojiLikesList', [{
      peer,
      msgSeq,
      emojiId,
      emojiType,
      cnt: count
    }, null])
  }

  async fetchFavEmojiList(count: number) {
    return await invoke('nodeIKernelMsgService/fetchFavEmojiList', [{
      resId: '',
      count,
      backwardFetch: true,
      forceRefresh: true
    }, null])
  }

  async generateMsgUniqueId(chatType: number) {
    const uniqueId = await invoke('nodeIKernelMsgService/generateMsgUniqueId', [{ chatType }])
    if (typeof uniqueId === 'string') {
      return uniqueId
    } else {
      const random = Math.trunc(Math.random() * 100)
      return `${Date.now()}${random}`
    }
  }
}
