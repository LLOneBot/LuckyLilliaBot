import { callNTQQApi, GeneralCallResult, NTQQApiMethod } from '../ntcall'
import { RawMessage, SendMessageElement, Peer, ChatType2 } from '../types'
import { selfInfo } from '../../common/data'
import { getBuildVersion } from '../../common/utils'
import { getSession } from '@/ntqqapi/wrapper'
import { NTEventDispatch } from '@/common/utils/EventTask'

export class NTQQMsgApi {
  static async getTempChatInfo(chatType: ChatType2, peerUid: string) {
    const session = getSession()
    return session?.getMsgService().getTempChatInfo(chatType, peerUid)!
  }

  static async prepareTempChat(toUserUid: string, GroupCode: string, nickname: string) {
    //By Jadx/Ida Mlikiowa
    let TempGameSession = {
      nickname: '',
      gameAppId: '',
      selfTinyId: '',
      peerRoleId: '',
      peerOpenId: '',
    }
    const session = getSession()
    return session?.getMsgService().prepareTempChat({
      chatType: ChatType2.KCHATTYPETEMPC2CFROMGROUP,
      peerUid: toUserUid,
      peerNickname: nickname,
      fromGroupCode: GroupCode,
      sig: '',
      selfPhone: '',
      selfUid: selfInfo.uid,
      gameSession: TempGameSession
    })
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
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.ACTIVE_CHAT_PREVIEW,
      args: [{ peer, cnt: 20 }, null],
    })
  }

  static async activateChatAndGetHistory(peer: Peer) {
    // await this.fetchRecentContact();
    // await sleep(500);
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.ACTIVE_CHAT_HISTORY,
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
    function generateMsgId() {
      const timestamp = Math.floor(Date.now() / 1000)
      const random = Math.floor(Math.random() * Math.pow(2, 32))
      const buffer = Buffer.alloc(8)
      buffer.writeUInt32BE(timestamp, 0)
      buffer.writeUInt32BE(random, 4)
      const msgId = BigInt("0x" + buffer.toString('hex')).toString()
      return msgId
    }
    // 此处有采用Hack方法 利用数据返回正确得到对应消息
    // 与之前 Peer队列 MsgSeq队列 真正的MsgId并发不同
    // 谨慎采用 目前测试暂无问题  Developer.Mlikiowa
    let msgId: string
    try {
      msgId = await NTQQMsgApi.getMsgUnique(peer.chatType, await NTQQMsgApi.getServerTime())
    } catch (error) {
      //if (!napCatCore.session.getMsgService()['generateMsgUniqueId'])
      //兜底识别策略V2
      msgId = generateMsgId()
    }
    peer.guildId = msgId
    const data = await NTEventDispatch.CallNormalEvent<
      (msgId: string, peer: Peer, msgElements: SendMessageElement[], map: Map<any, any>) => Promise<unknown>,
      (msgList: RawMessage[]) => void
    >(
      'NodeIKernelMsgService/sendMsg',
      'NodeIKernelMsgListener/onMsgInfoListUpdate',
      1,
      timeout,
      (msgRecords: RawMessage[]) => {
        for (let msgRecord of msgRecords) {
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
    const retMsg = data[1].find(msgRecord => {
      if (msgRecord.guildId === msgId) {
        return true
      }
    })
    return retMsg!
  }

  static async sendMsgV2(peer: Peer, msgElements: SendMessageElement[], waitComplete = true, timeout = 10000) {
    function generateMsgId() {
      const timestamp = Math.floor(Date.now() / 1000)
      const random = Math.floor(Math.random() * Math.pow(2, 32))
      const buffer = Buffer.alloc(8)
      buffer.writeUInt32BE(timestamp, 0)
      buffer.writeUInt32BE(random, 4)
      const msgId = BigInt('0x' + buffer.toString('hex')).toString()
      return msgId
    }
    // 此处有采用Hack方法 利用数据返回正确得到对应消息
    // 与之前 Peer队列 MsgSeq队列 真正的MsgId并发不同
    // 谨慎采用 目前测试暂无问题  Developer.Mlikiowa
    let msgId: string
    try {
      msgId = await NTQQMsgApi.getMsgUnique(peer.chatType, await NTQQMsgApi.getServerTime())
    } catch (error) {
      //if (!napCatCore.session.getMsgService()['generateMsgUniqueId'])
      //兜底识别策略V2
      msgId = generateMsgId().toString()
    }
    let data = await NTEventDispatch.CallNormalEvent<
      (msgId: string, peer: Peer, msgElements: SendMessageElement[], map: Map<any, any>) => Promise<unknown>,
      (msgList: RawMessage[]) => void
    >(
      'NodeIKernelMsgService/sendMsg',
      'NodeIKernelMsgListener/onMsgInfoListUpdate',
      1,
      timeout,
      (msgRecords: RawMessage[]) => {
        for (let msgRecord of msgRecords) {
          if (msgRecord.msgId === msgId && msgRecord.sendStatus === 2) {
            return true
          }
        }
        return false
      },
      msgId,
      peer,
      msgElements,
      new Map()
    )
    const retMsg = data[1].find(msgRecord => {
      if (msgRecord.msgId === msgId) {
        return true
      }
    })
    return retMsg!
  }

  static async getMsgUnique(chatType: number, time: string) {
    const session = getSession()
    if (getBuildVersion() >= 26702) {
      return session?.getMsgService().generateMsgUniqueId(chatType, time)!
    }
    return session?.getMsgService().getMsgUniqueId(time)!
  }

  static async getServerTime() {
    const session = getSession()
    return session?.getMSFService().getServerTime()!
  }

  static async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const session = getSession()
    return session?.getMsgService().forwardMsg(msgIds, srcPeer, [destPeer], [])!
  }

  static async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]): Promise<RawMessage> {
    const msgInfos = msgIds.map(id => {
      return { msgId: id, senderShowName: selfInfo.nick }
    })
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
          if (msgRecord.peerUid == destPeer.peerUid && msgRecord.senderUid == selfInfo.uid) {
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
      if (msg.peerUid == destPeer.peerUid && msg.senderUid == selfInfo.uid) {
        return msg
      }
    }
    throw new Error('转发消息超时')
  }

  static async queryMsgsWithFilterExWithSeq(peer: Peer, msgSeq: string) {
    const session = getSession()
    const ret = await session?.getMsgService().queryMsgsWithFilterEx('0', '0', msgSeq, {
      chatInfo: peer,//此处为Peer 为关键查询参数 没有啥也没有 by mlik iowa
      filterMsgType: [],
      filterSendersUid: [],
      filterMsgToTime: '0',
      filterMsgFromTime: '0',
      isReverseOrder: false,
      isIncludeCurrent: true,
      pageLimit: 1,
    })
    return ret!
  }

  static async getMsgsBySeqAndCount(peer: Peer, seq: string, count: number, desc: boolean, z: boolean) {
    const session = getSession()
    return await session?.getMsgService().getMsgsBySeqAndCount(peer, seq, count, desc, z)!
  }
}
