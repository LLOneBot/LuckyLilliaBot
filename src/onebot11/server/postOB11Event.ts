import {OB11Message, OB11MessageAt, OB11MessageData} from "../types";
import {getFriend, getGroup, getUidByUin, selfInfo} from "../../common/data";
import {OB11BaseMetaEvent} from "../event/meta/OB11BaseMetaEvent";
import {OB11BaseNoticeEvent} from "../event/notice/OB11BaseNoticeEvent";
import {WebSocket as WebSocketClass} from "ws";
import {wsReply} from "./ws/reply";
import {log} from "../../common/utils/log";
import {getConfigUtil} from "../../common/config";
import crypto from 'crypto';
import {NTQQFriendApi, NTQQGroupApi, NTQQMsgApi, Peer} from "../../ntqqapi/api";
import {ChatType, Group, GroupRequestOperateTypes} from "../../ntqqapi/types";
import {convertMessage2List, createSendElements, sendMsg} from "../action/msg/SendMsg";
import {dbUtil} from "../../common/db";
import {OB11FriendRequestEvent} from "../event/request/OB11FriendRequest";
import {OB11GroupRequestEvent} from "../event/request/OB11GroupRequest";
import {isNull} from "../../common/utils";

export type PostEventType = OB11Message | OB11BaseMetaEvent | OB11BaseNoticeEvent

interface QuickActionPrivateMessage {
    reply?: string;
    auto_escape?: boolean;
}

interface QuickActionGroupMessage extends QuickActionPrivateMessage {
    // 回复群消息
    at_sender?: boolean
    delete?: boolean
    kick?: boolean
    ban?: boolean
    ban_duration?: number
    //
}

interface QuickActionFriendRequest {
    approve?: boolean
    remark?: string
}

interface QuickActionGroupRequest {
    approve?: boolean
    reason?: string
}

type QuickAction =
    QuickActionPrivateMessage
    & QuickActionGroupMessage
    & QuickActionFriendRequest
    & QuickActionGroupRequest

const eventWSList: WebSocketClass[] = [];

export function registerWsEventSender(ws: WebSocketClass) {
    eventWSList.push(ws);
}

export function unregisterWsEventSender(ws: WebSocketClass) {
    let index = eventWSList.indexOf(ws);
    if (index !== -1) {
        eventWSList.splice(index, 1);
    }
}

export function postWsEvent(event: PostEventType) {
    for (const ws of eventWSList) {
        new Promise(() => {
            wsReply(ws, event);
        }).then()
    }
}

export function postOB11Event(msg: PostEventType, reportSelf = false) {
    const config = getConfigUtil().getConfig();
    // 判断msg是否是event
    if (!config.reportSelfMessage && !reportSelf) {
        if (msg.post_type === "message" && (msg as OB11Message).user_id.toString() == selfInfo.uin) {
            return
        }
    }
    if (config.ob11.enableHttpPost) {
        const msgStr = JSON.stringify(msg);
        const hmac = crypto.createHmac('sha1', config.ob11.httpSecret);
        hmac.update(msgStr);
        const sig = hmac.digest('hex');
        let headers = {
            "Content-Type": "application/json",
            "x-self-id": selfInfo.uin
        }
        if (config.ob11.httpSecret) {
            headers["x-signature"] = "sha1=" + sig;
        }
        for (const host of config.ob11.httpHosts) {
            fetch(host, {
                method: "POST",
                headers,
                body: msgStr
            }).then(async (res) => {
                log(`新消息事件HTTP上报成功: ${host} `, msgStr);
                // todo: 处理不够优雅，应该使用高级泛型进行QuickAction类型识别
                let resJson: QuickAction;
                try {
                    resJson = await res.json();
                    log(`新消息事件HTTP上报返回快速操作: `, JSON.stringify(resJson))
                } catch (e) {
                    log(`新消息事件HTTP上报没有返回快速操作，不需要处理`)
                    return
                }
                if (msg.post_type === "message") {
                    msg = msg as OB11Message;
                    const rawMessage = await dbUtil.getMsgByShortId(msg.message_id)
                    resJson = resJson as QuickActionPrivateMessage | QuickActionGroupMessage
                    const reply = resJson.reply
                    let peer: Peer = {
                        chatType: ChatType.friend,
                        peerUid: msg.user_id.toString()
                    }
                    if (msg.message_type == "private") {
                        peer.peerUid = getUidByUin(msg.user_id.toString())
                        if (msg.sub_type === "group") {
                            peer.chatType = ChatType.temp
                        }
                    } else {
                        peer.chatType = ChatType.group
                        peer.peerUid = msg.group_id.toString()
                    }
                    if (reply) {
                        let group: Group = null
                        let replyMessage: OB11MessageData[] = []

                        if (msg.message_type == "group") {
                            group = await getGroup(msg.group_id.toString())
                            if ((resJson as QuickActionGroupMessage).at_sender) {
                                replyMessage.push({
                                    type: "at",
                                    data: {
                                        qq: msg.user_id.toString()
                                    }
                                } as OB11MessageAt)
                            }
                        }
                        replyMessage = replyMessage.concat(convertMessage2List(reply, resJson.auto_escape))
                        const {sendElements, deleteAfterSentFiles} = await createSendElements(replyMessage, group)
                        log(`发送消息给`, peer, sendElements)
                        sendMsg(peer, sendElements, deleteAfterSentFiles, false).then()
                    } else if (resJson.delete) {
                        NTQQMsgApi.recallMsg(peer, [rawMessage.msgId]).then()
                    } else if (resJson.kick) {
                        NTQQGroupApi.kickMember(peer.peerUid, [rawMessage.senderUid]).then()
                    } else if (resJson.ban) {
                        NTQQGroupApi.banMember(peer.peerUid, [{
                            uid: rawMessage.senderUid,
                            timeStamp: resJson.ban_duration || 60 * 30
                        }],).then()
                    }

                } else if (msg.post_type === "request") {
                    if ((msg as OB11FriendRequestEvent).request_type === "friend") {
                        resJson = resJson as QuickActionFriendRequest
                        if (!isNull(resJson.approve)) {
                            // todo: set remark
                            NTQQFriendApi.handleFriendRequest(((msg as OB11FriendRequestEvent).flag), resJson.approve).then()
                        }
                    } else if ((msg as OB11GroupRequestEvent).request_type === "group") {
                        resJson = resJson as QuickActionGroupRequest
                        if (!isNull(resJson.approve)) {
                            NTQQGroupApi.handleGroupRequest((msg as OB11FriendRequestEvent).flag, resJson.approve ? GroupRequestOperateTypes.approve : GroupRequestOperateTypes.reject, resJson.reason).then()
                        }
                    }
                }
            }, (err: any) => {
                log(`新消息事件HTTP上报失败: ${host} `, err, msg);
            });
        }
    }
    postWsEvent(msg);
}