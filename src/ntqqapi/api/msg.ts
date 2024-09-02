import { invoke, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { RawMessage, SendMessageElement, Peer, ChatType2 } from '../types'
import { getSession } from '@/ntqqapi/wrapper'
import { NTEventDispatch } from '@/common/utils/eventTask'
import { Service, Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    ntMsgApi: NTQQMsgApi
  }
}

function generateMsgId() {
  const timestamp = Math.floor(Date.now() / 1000)
  const random = Math.floor(Math.random() * Math.pow(2, 32))
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(timestamp, 0)
  buffer.writeUInt32BE(random, 4)
  const msgId = BigInt('0x' + buffer.toString('hex')).toString()
  return msgId
}

export class NTQQMsgApi extends Service {
  static inject = ['ntUserApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntMsgApi', true)
  }

  async getTempChatInfo(chatType: ChatType2, peerUid: string) {
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
    return await invoke<GeneralCallResult>(NTMethod.ACTIVE_CHAT_PREVIEW, [{ peer, cnt: 20 }, null])
  }

  async activateChatAndGetHistory(peer: Peer) {
    return await invoke<GeneralCallResult>(NTMethod.ACTIVE_CHAT_HISTORY, [{ peer, cnt: 20 }, null])
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

  async sendMsg(peer: Peer, msgElements: SendMessageElement[], waitComplete = true, timeout = 10000) {
    const msgId = generateMsgId()
    peer.guildId = msgId
    let msgList: RawMessage[]
    if (NTEventDispatch.initialised) {
      const data = await NTEventDispatch.CallNormalEvent<
        (msgId: string, peer: Peer, msgElements: SendMessageElement[], map: Map<any, any>) => Promise<unknown>,
        (msgList: RawMessage[]) => void
      >(
        'NodeIKernelMsgService/sendMsg',
        'NodeIKernelMsgListener/onMsgInfoListUpdate',
        1,
        timeout,
        (msgRecords: RawMessage[]) => {
          for (const msgRecord of msgRecords) {
            if (msgRecord.guildId === msgId && msgRecord.sendStatus === 2) {
              return true
            }
          }
          return false
        },
        '0',
        peer,
        msgElements,
        new Map()
      )
      msgList = data[1]
    } else {
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
      msgList = data.msgList
    }
    return msgList.find(msgRecord => msgRecord.guildId === msgId)
  }

  async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const session = getSession()
    if (session) {
      return session.getMsgService().forwardMsg(msgIds, srcPeer, [destPeer], [])
    } else {
      return await invoke<GeneralCallResult>(NTMethod.FORWARD_MSG, [{
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
    let msgList: RawMessage[]
    if (NTEventDispatch.initialised) {
      const data = await NTEventDispatch.CallNormalEvent<
        (msgInfo: typeof msgInfos, srcPeer: Peer, destPeer: Peer, comment: Array<any>, attr: Map<any, any>,) => Promise<unknown>,
        (msgList: RawMessage[]) => void
      >(
        'NodeIKernelMsgService/multiForwardMsgWithComment',
        'NodeIKernelMsgListener/onMsgInfoListUpdate',
        1,
        5000,
        (msgRecords: RawMessage[]) => {
          for (let msgRecord of msgRecords) {
            if (msgRecord.peerUid == destPeer.peerUid && msgRecord.senderUid == selfUid) {
              return true
            }
          }
          return false
        },
        msgInfos,
        srcPeer,
        destPeer,
        [],
        new Map()
      )
      msgList = data[1]
    } else {
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
      msgList = data.msgList
    }
    for (const msg of msgList) {
      const arkElement = msg.elements.find(ele => ele.arkElement)
      if (!arkElement) {
        continue
      }
      const forwardData: any = JSON.parse(arkElement.arkElement.bytesData)
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

  /** 27187 TODO */
  async getLastestMsgByUids(peer: Peer, count = 20, isReverseOrder = false) {
    const session = getSession()
    const ret = await session?.getMsgService().queryMsgsWithFilterEx('0', '0', '0', {
      chatInfo: peer,
      filterMsgType: [],
      filterSendersUid: [],
      filterMsgToTime: '0',
      filterMsgFromTime: '0',
      isReverseOrder: isReverseOrder, //此参数有点离谱 注意不是本次查询的排序 而是全部消历史信息的排序 默认false 从新消息拉取到旧消息
      isIncludeCurrent: true,
      pageLimit: count,
    })
    return ret
  }

  async getSingleMsg(peer: Peer, msgSeq: string) {
    const session = getSession()
    if (session) {
      return await session.getMsgService().getSingleMsg(peer, msgSeq)
    } else {
      return await invoke('nodeIKernelMsgService/getSingleMsg', [{ peer, msgSeq }, null])
    }
  }
}
