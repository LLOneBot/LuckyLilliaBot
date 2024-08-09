import { callNTQQApi, GeneralCallResult, NTQQApiMethod } from '../ntcall'
import { ChatType, RawMessage, SendMessageElement, Peer } from '../types'
import { dbUtil } from '../../common/db'
import { selfInfo } from '../../common/data'
import { ReceiveCmdS, registerReceiveHook } from '../hook'
import { log } from '../../common/utils/log'
import { sleep } from '../../common/utils/helper'
import { isQQ998, getBuildVersion } from '../../common/utils'
import { getSession } from '@/ntqqapi/wrapper'
import { NTEventDispatch } from '@/common/utils/EventTask'

export let sendMessagePool: Record<string, ((sendSuccessMsg: RawMessage) => void) | null> = {} // peerUid: callbackFunc

export let sentMessages: Record<string, RawMessage> = {}  // msgId: RawMessage

async function sendWaiter(peer: Peer, waitComplete = true, timeout: number = 10000) {
  // 等待上一个相同的peer发送完
  const peerUid = peer.peerUid
  let checkLastSendUsingTime = 0
  const waitLastSend = async () => {
    if (checkLastSendUsingTime > timeout) {
      throw '发送超时'
    }
    let lastSending = sendMessagePool[peer.peerUid]
    if (lastSending) {
      // log("有正在发送的消息，等待中...")
      await sleep(500)
      checkLastSendUsingTime += 500
      return await waitLastSend()
    }
    else {
      return
    }
  }
  await waitLastSend()

  let sentMessage: RawMessage | null = null
  sendMessagePool[peerUid] = async (rawMessage: RawMessage) => {
    delete sendMessagePool[peerUid]
    sentMessage = rawMessage
    sentMessages[rawMessage.msgId] = rawMessage
  }

  let checkSendCompleteUsingTime = 0
  const checkSendComplete = async (): Promise<RawMessage> => {
    if (sentMessage) {
      if (waitComplete) {
        if (sentMessage.sendStatus == 2) {
          delete sentMessages[sentMessage.msgId]
          return sentMessage
        }
      }
      else {
        delete sentMessages[sentMessage.msgId]
        return sentMessage
      }
      // log(`给${peerUid}发送消息成功`)
    }
    checkSendCompleteUsingTime += 500
    if (checkSendCompleteUsingTime > timeout) {
      throw '发送超时'
    }
    await sleep(500)
    return await checkSendComplete()
  }
  return checkSendComplete()
}

export class NTQQMsgApi {
  static enterOrExitAIO(peer: Peer, enter: boolean) {
    return callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.ENTER_OR_EXIT_AIO,
      args: [
        {
          "info_list": [
            {
              peer,
              "option": enter ? 1 : 2
            }
          ]
        },
        {
          "send": true
        },
      ],
    })
  }
  static async setEmojiLike(peer: Peer, msgSeq: string, emojiId: string, set: boolean = true) {
    // nt_qq//global//nt_data//Emoji//emoji-resource//sysface_res/apng/ 下可以看到所有QQ表情预览
    // nt_qq\global\nt_data\Emoji\emoji-resource\face_config.json 里面有所有表情的id, 自带表情id是QSid, 标准emoji表情id是QCid
    // 其实以官方文档为准是最好的，https://bot.q.qq.com/wiki/develop/api-v2/openapi/emoji/model.html#EmojiType
    emojiId = emojiId.toString()
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.EMOJI_LIKE,
      args: [
        {
          peer,
          msgSeq,
          emojiId,
          emojiType: emojiId.length > 3 ? '2' : '1',
          setEmoji: set,
        },
        null,
      ],
    })
  }

  static async getMultiMsg(peer: Peer, rootMsgId: string, parentMsgId: string) {
    return await callNTQQApi<GeneralCallResult & { msgList: RawMessage[] }>({
      methodName: NTQQApiMethod.GET_MULTI_MSG,
      args: [
        {
          peer,
          rootMsgId,
          parentMsgId,
        },
        null,
      ],
    })
  }

  static async getMsgBoxInfo(peer: Peer) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.GET_MSG_BOX_INFO,
      args: [
        {
          contacts: [
            peer
          ],
        },
        null,
      ],
    })
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

  static async getMsgHistory(peer: Peer, msgId: string, count: number) {
    // 消息时间从旧到新
    return await callNTQQApi<GeneralCallResult & { msgList: RawMessage[] }>({
      methodName: isQQ998 ? NTQQApiMethod.ACTIVE_CHAT_HISTORY : NTQQApiMethod.HISTORY_MSG,
      args: [
        {
          peer,
          msgId,
          cnt: count,
          queryOrder: true,
        },
        null,
      ],
    })
  }

  static async fetchRecentContact() {
    await callNTQQApi({
      methodName: NTQQApiMethod.RECENT_CONTACT,
      args: [
        {
          fetchParam: {
            anchorPointContact: {
              contactId: '',
              sortField: '',
              pos: 0,
            },
            relativeMoveCount: 0,
            listType: 2, // 1普通消息，2群助手内的消息
            count: 200,
            fetchOld: true,
          },
        },
      ],
    })
  }

  static async recallMsg(peer: Peer, msgIds: string[]) {
    return await callNTQQApi({
      methodName: NTQQApiMethod.RECALL_MSG,
      args: [
        {
          peer,
          msgIds,
        },
        null,
      ],
    })
  }

  static async sendMsg(peer: Peer, msgElements: SendMessageElement[], waitComplete = true, timeout = 10000) {
    if (getBuildVersion() >= 26702) {
      return NTQQMsgApi.sendMsgV2(peer, msgElements, waitComplete, timeout)
    }
    const waiter = sendWaiter(peer, waitComplete, timeout)
    callNTQQApi({
      methodName: NTQQApiMethod.SEND_MSG,
      args: [
        {
          msgId: '0',
          peer,
          msgElements,
          msgAttributeInfos: new Map(),
        },
        null,
      ],
    }).then()
    return await waiter
  }

  static async sendMsgV2(peer: Peer, msgElements: SendMessageElement[], waitComplete = true, timeout = 10000) {
    if (peer.chatType === ChatType.temp) {
      //await NTQQMsgApi.PrepareTempChat().then().catch()
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
    const waiter = sendWaiter(destPeer, true, 10000)
    callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.FORWARD_MSG,
      args: [
        {
          msgIds: msgIds,
          srcContact: srcPeer,
          dstContacts: [destPeer],
          commentElements: [],
          msgAttributeInfos: new Map(),
        },
        null,
      ],
    }).then().catch(log)
    return await waiter
  }

  static async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
    const msgInfos = msgIds.map((id) => {
      return { msgId: id, senderShowName: selfInfo.nick }
    })
    const apiArgs = [
      {
        msgInfos,
        srcContact: srcPeer,
        dstContact: destPeer,
        commentElements: [],
        msgAttributeInfos: new Map(),
      },
      null,
    ]
    return await new Promise<RawMessage>((resolve, reject) => {
      let complete = false
      setTimeout(() => {
        if (!complete) {
          reject('转发消息超时')
        }
      }, 5000)
      registerReceiveHook(ReceiveCmdS.SELF_SEND_MSG, async (payload: { msgRecord: RawMessage }) => {
        const msg = payload.msgRecord
        // 需要判断它是转发的消息，并且识别到是当前转发的这一条
        const arkElement = msg.elements.find((ele) => ele.arkElement)
        if (!arkElement) {
          // log("收到的不是转发消息")
          return
        }
        const forwardData: any = JSON.parse(arkElement.arkElement.bytesData)
        if (forwardData.app != 'com.tencent.multimsg') {
          return
        }
        if (msg.peerUid == destPeer.peerUid && msg.senderUid == selfInfo.uid) {
          complete = true
          await dbUtil.addMsg(msg)
          resolve(msg)
          log('转发消息成功：', payload)
        }
      })
      callNTQQApi<GeneralCallResult>({
        methodName: NTQQApiMethod.MULTI_FORWARD_MSG,
        args: apiArgs,
      }).then((result) => {
        log('转发消息结果:', result, apiArgs)
        if (result.result !== 0) {
          complete = true
          reject('转发消息失败,' + JSON.stringify(result))
        }
      })
    })
  }
  static async getMsgsBySeqAndCount(peer: Peer, seq: string, count: number, desc: boolean, z: boolean) {
    const session = getSession()
    return await session?.getMsgService().getMsgsBySeqAndCount(peer, seq, count, desc, z);
  }
}
