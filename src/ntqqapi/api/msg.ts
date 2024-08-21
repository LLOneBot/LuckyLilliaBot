import { invoke, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { RawMessage, SendMessageElement, Peer, ChatType2 } from '../types'
import { getSelfNick, getSelfUid } from '../../common/data'
import { getSession } from '@/ntqqapi/wrapper'
import { NTEventDispatch } from '@/common/utils/EventTask'

function generateMsgId() {
  const timestamp = Math.floor(Date.now() / 1000)
  const random = Math.floor(Math.random() * Math.pow(2, 32))
  const buffer = Buffer.alloc(8)
  buffer.writeUInt32BE(timestamp, 0)
  buffer.writeUInt32BE(random, 4)
  const msgId = BigInt("0x" + buffer.toString('hex')).toString()
  return msgId
}

export class NTQQMsgApi {
  static async getTempChatInfo(chatType: ChatType2, peerUid: string) {
    const session = getSession()
    return session?.getMsgService().getTempChatInfo(chatType, peerUid)!
  }

  static async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, set: boolean = true) {
    // nt_qq//global//nt_data//Emoji//emoji-resource//sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq\global\nt_data\Emoji\emoji-resource\face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    emojiId = emojiId.toString()
    const session = getSession()
    return session?.getMsgService().setMsgEmojiLikes(peer, msgSeq, emojiId, emojiId.length > 3 ? '2' : '1', set)
  }

  static async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    const session = getSession()
    return session?.getMsgService().getMultiMsg(peer, rootMsgId, parentMsgId)!
  }

  static async activateChat(peer: Peer) {
    // await this.fetchRecentContact();
    // await sleep(500);
    return await invoke<GeneralCallResult>({
      methodName: NTMethod.ACTIVE_CHAT_PREVIEW,
      args: [{ peer, cnt: 20 }, null],
    })
  }

  static async activateChatAndGetHistory(peer: Peer) {
    // await this.fetchRecentContact();
    // await sleep(500);
    return await invoke<GeneralCallResult>({
      methodName: NTMethod.ACTIVE_CHAT_HISTORY,
      // 参数似乎不是这样
      args: [{ peer, cnt: 20 }, null],
    })
  }

  static async getMsgsByMsgId(peer: Peer | undefined, msgIds: string[] | undefined) {
    if (!peer) throw new Error('peer is not allowed')
    if (!msgIds) throw new Error('msgIds is not allowed')
    const session = getSession()
    //Mlikiowa： 参数不合规会导致NC异常崩溃 原因是TX未对进入参数判断 对应Android标记@NotNull AndroidJADX分析可得
    return await session?.getMsgService().getMsgsByMsgId(peer, msgIds)!
  }

  static async getMsgHistory(peer: Peer, msgId: string, count: number, isReverseOrder: boolean = false) {
    const session = getSession()
    // 消息时间从旧到新
    return session?.getMsgService().getMsgsIncludeSelf(peer, msgId, count, isReverseOrder)!
  }

  static async recallMsg(peer: Peer, msgIds: string[]) {
    const session = getSession()
    return await session?.getMsgService().recallMsg({
      chatType: peer.chatType,
      peerUid: peer.peerUid
    }, msgIds)
  }

  static async sendMsg(peer: Peer, msgElements: SendMessageElement[], waitComplete = true, timeout = 10000) {
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
      const data = await invoke<{ msgList: RawMessage[] }>({
        methodName: 'nodeIKernelMsgService/sendMsg',
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
        args: [
          {
            msgId: '0',
            peer,
            msgElements,
            msgAttributeInfos: new Map()
          },
          null
        ],
      })
      msgList = data.msgList
    }
    const retMsg = msgList.find(msgRecord => {
      if (msgRecord.guildId === msgId) {
        return true
      }
    })
    return retMsg!
  }

  static async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const session = getSession()
    return session?.getMsgService().forwardMsg(msgIds, srcPeer, [destPeer], [])!
  }

  static async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    const senderShowName = await getSelfNick()
    const msgInfos = msgIds.map(id => {
      return { msgId: id, senderShowName }
    })
    const selfUid = getSelfUid()
    let data = await NTEventDispatch.CallNormalEvent<
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
    for (let msg of data[1]) {
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

  static async getMsgsBySeqAndCount(peer: Peer, seq: string, count: number, desc: boolean, z: boolean) {
    const session = getSession()
    return await session?.getMsgService().getMsgsBySeqAndCount(peer, seq, count, desc, z)!
  }

  static async getLastestMsgByUids(peer: Peer, count = 20, isReverseOrder = false) {
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
    return ret!
  }

  static async getSingleMsg(peer: Peer, seq: string) {
    const session = getSession()
    return await session?.getMsgService().getSingleMsg(peer, seq)!
  }
}
