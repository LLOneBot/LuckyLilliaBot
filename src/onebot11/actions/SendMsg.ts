import { AtType, ChatType, Group } from "../../ntqqapi/types";
import { friends, getGroup, getStrangerByUin, msgHistory } from "../../common/data";
import { OB11Return, OB11MessageData, OB11MessageDataType, OB11PostSendMsg } from '../types';
import { NTQQApi } from "../../ntqqapi/ntcall";
import { Peer } from "../../ntqqapi/ntcall";
import { SendMessageElement } from "../../ntqqapi/types";
import { SendMsgElementConstructor } from "../../ntqqapi/constructor";
import { uri2local } from "../utils";
import { OB11Response } from "./utils";
import { v4 as uuid4 } from 'uuid';
import { log } from "../../common/utils";
import { BaseCheckResult } from "./types";

export type ActionType = 'send_msg'

export interface PayloadType extends OB11PostSendMsg {
    action: ActionType
}

export interface ReturnDataType {
    message_id: string
}

class SendMsg {
    static ACTION_TYPE: ActionType = 'send_msg'

    async check(jsonData: any): Promise<BaseCheckResult> {
        return {
            valid: true,
        }
    }

    async handle(jsonData: any) {
        const result = await this.check(jsonData)
        if (!result.valid) {
            return OB11Response.error(result.message)
        }
        const resData = await this._handle(jsonData)
        return resData
    }

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        const peer: Peer = {
            chatType: ChatType.friend,
            peerUid: ""
        }
        let group: Group | undefined = undefined;
        if (payload?.group_id) {
            group = await getGroup(payload.group_id.toString())
            if (!group) {
                return OB11Response.error(`群${payload.group_id}不存在`)
            }
            peer.chatType = ChatType.group
            // peer.name = group.name
            peer.peerUid = group.groupCode
        }
        else if (payload?.user_id) {
            const friend = friends.find(f => f.uin == payload.user_id.toString())
            if (friend) {
                // peer.name = friend.nickName
                peer.peerUid = friend.uid
            }
            else {
                peer.chatType = ChatType.temp
                const tempUser = getStrangerByUin(payload.user_id.toString())
                if (!tempUser) {
                    return OB11Response.error(`找不到私聊对象${payload.user_id}`)
                }
                // peer.name = tempUser.nickName
                peer.peerUid = tempUser.uid
            }
        }
        if (typeof payload.message === "string") {
            payload.message = [{
                type: OB11MessageDataType.text,
                data: {
                    text: payload.message
                }
            }] as OB11MessageData[]
        }
        else if (!Array.isArray(payload.message)) {
            payload.message = [payload.message]
        }
        const sendElements: SendMessageElement[] = []
        for (let sendMsg of payload.message) {
            switch (sendMsg.type) {
                case OB11MessageDataType.text: {
                    const text = sendMsg.data?.text;
                    if (text) {
                        sendElements.push(SendMsgElementConstructor.text(sendMsg.data!.text))
                    }
                } break;
                case OB11MessageDataType.at: {
                    let atQQ = sendMsg.data?.qq;
                    if (atQQ) {
                        atQQ = atQQ.toString()
                        if (atQQ === "all") {
                            sendElements.push(SendMsgElementConstructor.at(atQQ, atQQ, AtType.atAll, "全体成员"))
                        }
                        else {
                            const atMember = group?.members.find(m => m.uin == atQQ)
                            if (atMember) {
                                sendElements.push(SendMsgElementConstructor.at(atQQ, atMember.uid, AtType.atUser, atMember.cardName || atMember.nick))
                            }
                        }
                    }
                } break;
                case OB11MessageDataType.reply: {
                    let replyMsgId = sendMsg.data.id;
                    if (replyMsgId) {
                        replyMsgId = replyMsgId.toString()
                        const replyMsg = msgHistory[replyMsgId]
                        if (replyMsg) {
                            sendElements.push(SendMsgElementConstructor.reply(replyMsg.msgSeq, replyMsgId, replyMsg.senderUin, replyMsg.senderUin))
                        }
                    }
                } break;
                case OB11MessageDataType.image: {
                    const file = sendMsg.data?.file
                    if (file) {
                        const picPath = await (await uri2local(uuid4(), file)).path
                        if (picPath) {
                            sendElements.push(await SendMsgElementConstructor.pic(picPath))
                        }
                    }
                } break;
                case OB11MessageDataType.voice: {
                    const file = sendMsg.data?.file
                    if (file) {
                        const voicePath = await (await uri2local(uuid4(), file)).path
                        if (voicePath) {
                            sendElements.push(await SendMsgElementConstructor.ptt(voicePath))
                        }
                    }
                }
            }
        }
        log("send msg:", peer, sendElements)
        try {
            const returnMsg = await NTQQApi.sendMsg(peer, sendElements)
            return OB11Response.ok({ message_id: returnMsg.msgId })
        } catch (e) {
            return OB11Response.error(e.toString())
        }
    }
}

export default SendMsg