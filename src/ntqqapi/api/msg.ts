import {callNTQQApi, GeneralCallResult, NTQQApiMethod} from "../ntcall";
import {ChatType, RawMessage, SendMessageElement} from "../types";
import {dbUtil} from "../../common/db";
import {selfInfo} from "../../common/data";
import {ReceiveCmdS, registerReceiveHook} from "../hook";
import {log} from "../../common/utils/log";
import {sleep} from "../../common/utils/helper";

export let sendMessagePool: Record<string, ((sendSuccessMsg: RawMessage) => void) | null> = {}// peerUid: callbackFunnc

export interface Peer {
    chatType: ChatType
    peerUid: string  // 如果是群聊uid为群号，私聊uid就是加密的字符串
    guildId?: ""
}

export class NTQQMsgApi {
    static async activateGroupChat(groupCode: string) {
        // await this.fetchRecentContact();
        // await sleep(500);
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.ADD_ACTIVE_CHAT,
            args: [{peer:{peerUid: groupCode, chatType: ChatType.group}, cnt: 20}, null]
        })
    }
    static async getMsgHistory(peer: Peer, msgId: string, count: number) {
        return await callNTQQApi<GeneralCallResult & {msgList: RawMessage[]}>({
            methodName: NTQQApiMethod.HISTORY_MSG,
            args: [{
                peer,
                msgId,
                cnt: count,
                queryOrder: true,
            }, null]
        })
    }
    static async fetchRecentContact(){
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
                        listType: 2,  // 1普通消息，2群助手内的消息
                        count: 200,
                        fetchOld: true,
                    },
                }
            ]
        })
    }

    static async recallMsg(peer: Peer, msgIds: string[]) {
        return await callNTQQApi({
            methodName: NTQQApiMethod.RECALL_MSG,
            args: [{
                peer,
                msgIds
            }, null]
        })
    }

    static async sendMsg(peer: Peer, msgElements: SendMessageElement[],
                         waitComplete = true, timeout = 10000) {
        const peerUid = peer.peerUid

        // 等待上一个相同的peer发送完
        let checkLastSendUsingTime = 0;
        const waitLastSend = async () => {
            if (checkLastSendUsingTime > timeout) {
                throw ("发送超时")
            }
            let lastSending = sendMessagePool[peer.peerUid]
            if (lastSending) {
                // log("有正在发送的消息，等待中...")
                await sleep(500);
                checkLastSendUsingTime += 500;
                return await waitLastSend();
            } else {
                return;
            }
        }
        await waitLastSend();

        let sentMessage: RawMessage = null;
        sendMessagePool[peerUid] = async (rawMessage: RawMessage) => {
            delete sendMessagePool[peerUid];
            sentMessage = rawMessage;
        }

        let checkSendCompleteUsingTime = 0;
        const checkSendComplete = async (): Promise<RawMessage> => {
            if (sentMessage) {
                if (waitComplete) {
                    if ((await dbUtil.getMsgByLongId(sentMessage.msgId)).sendStatus == 2) {
                        return sentMessage
                    }
                } else {
                    return sentMessage
                }
                // log(`给${peerUid}发送消息成功`)
            }
            checkSendCompleteUsingTime += 500
            if (checkSendCompleteUsingTime > timeout) {
                throw ('发送超时')
            }
            await sleep(500)
            return await checkSendComplete()
        }

        callNTQQApi({
            methodName: NTQQApiMethod.SEND_MSG,
            args: [{
                msgId: "0",
                peer, msgElements,
                msgAttributeInfos: new Map(),
            }, null]
        }).then()
        return await checkSendComplete()
    }

    static async forwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.FORWARD_MSG,
            args: [
                {
                    msgIds: msgIds,
                    srcContact: srcPeer,
                    dstContacts: [
                        destPeer
                    ],
                    commentElements: [],
                    msgAttributeInfos: new Map()
                },
                null,
            ]
        })
    }

    static async multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
        const msgInfos = msgIds.map(id => {
            return {msgId: id, senderShowName: selfInfo.nick}
        })
        const apiArgs = [
            {
                msgInfos,
                srcContact: srcPeer,
                dstContact: destPeer,
                commentElements: [],
                msgAttributeInfos: new Map()
            },
            null,
        ]
        return await new Promise<RawMessage>((resolve, reject) => {
            let complete = false
            setTimeout(() => {
                if (!complete) {
                    reject("转发消息超时");
                }
            }, 5000)
            registerReceiveHook(ReceiveCmdS.SELF_SEND_MSG, async (payload: { msgRecord: RawMessage }) => {
                const msg = payload.msgRecord
                // 需要判断它是转发的消息，并且识别到是当前转发的这一条
                const arkElement = msg.elements.find(ele => ele.arkElement)
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
                args: apiArgs
            }).then(result => {
                log("转发消息结果:", result, apiArgs)
                if (result.result !== 0) {
                    complete = true;
                    reject("转发消息失败," + JSON.stringify(result));
                }
            })
        })
    }


}