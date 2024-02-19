import {AtType, ChatType, Group, SendMessageElement} from "../../ntqqapi/types";
import {addHistoryMsg, friends, getGroup, getHistoryMsgByShortId, getStrangerByUin,} from "../../common/data";
import {OB11MessageData, OB11MessageDataType, OB11PostSendMsg} from '../types';
import {NTQQApi, Peer} from "../../ntqqapi/ntcall";
import {SendMsgElementConstructor} from "../../ntqqapi/constructor";
import {uri2local} from "../utils";
import {v4 as uuid4} from 'uuid';
import BaseAction from "./BaseAction";
import {ActionName} from "./types";
import * as fs from "fs";

export interface ReturnDataType {
    message_id: number
}

class SendMsg extends BaseAction<OB11PostSendMsg, ReturnDataType> {
    actionName = ActionName.SendMsg

    protected async _handle(payload: OB11PostSendMsg) {
        const peer: Peer = {
            chatType: ChatType.friend,
            peerUid: ""
        }
        let deleteAfterSentFiles: string[] = []
        let group: Group | undefined = undefined;
        if (payload?.group_id) {
            group = await getGroup(payload.group_id.toString())
            if (!group) {
                throw (`群${payload.group_id}不存在`)
            }
            peer.chatType = ChatType.group
            // peer.name = group.name
            peer.peerUid = group.groupCode
        } else if (payload?.user_id) {
            const friend = friends.find(f => f.uin == payload.user_id.toString())
            if (friend) {
                // peer.name = friend.nickName
                peer.peerUid = friend.uid
            } else {
                peer.chatType = ChatType.temp
                const tempUser = getStrangerByUin(payload.user_id.toString())
                if (!tempUser) {
                    throw (`找不到私聊对象${payload.user_id}`)
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
        } else if (!Array.isArray(payload.message)) {
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
                }
                    break;
                case OB11MessageDataType.at: {
                    let atQQ = sendMsg.data?.qq;
                    if (atQQ) {
                        atQQ = atQQ.toString()
                        if (atQQ === "all") {
                            sendElements.push(SendMsgElementConstructor.at(atQQ, atQQ, AtType.atAll, "全体成员"))
                        } else {
                            const atMember = group?.members.find(m => m.uin == atQQ)
                            if (atMember) {
                                sendElements.push(SendMsgElementConstructor.at(atQQ, atMember.uid, AtType.atUser, atMember.cardName || atMember.nick))
                            }
                        }
                    }
                }
                    break;
                case OB11MessageDataType.reply: {
                    let replyMsgId = sendMsg.data.id;
                    if (replyMsgId) {
                        replyMsgId = replyMsgId.toString()
                        const replyMsg = getHistoryMsgByShortId(replyMsgId)
                        if (replyMsg) {
                            sendElements.push(SendMsgElementConstructor.reply(replyMsg.msgSeq, replyMsg.msgId, replyMsg.senderUin, replyMsg.senderUin))
                        }
                    }
                }
                    break;
                case OB11MessageDataType.face: {
                    const faceId = sendMsg.data?.id
                    if (faceId) {
                        sendElements.push(SendMsgElementConstructor.face(parseInt(faceId)))
                    }
                }
                    break;
                case OB11MessageDataType.image:
                case OB11MessageDataType.voice: {
                    const file = sendMsg.data?.file
                    if (file) {
                        const {path, isLocal} = (await uri2local(uuid4(), file))
                        if (path) {
                            if (!isLocal) { // 只删除http和base64转过来的文件
                                deleteAfterSentFiles.push(path)
                            }
                            if (sendMsg.type === OB11MessageDataType.image) {
                                sendElements.push(await SendMsgElementConstructor.pic(path))
                            } else {
                                sendElements.push(await SendMsgElementConstructor.ptt(path))
                            }
                        }
                    }
                }
            }
        }
        // log("send msg:", peer, sendElements)
        try {
            const returnMsg = await NTQQApi.sendMsg(peer, sendElements)
            addHistoryMsg(returnMsg)
            deleteAfterSentFiles.map(f => fs.unlink(f, () => {
            }))
            return {message_id: returnMsg.msgShortId}
        } catch (e) {
            throw (e.toString())
        }
    }
}

export default SendMsg