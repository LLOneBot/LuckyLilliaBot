import { getConfigUtil, log } from "../common/utils";

const express = require("express");
import { Request } from 'express';
import { Response } from 'express';

const JSONbig = require('json-bigint')({ storeAsString: true });
import { AtType, ChatType, Group, SelfInfo } from "../ntqqapi/types";
import { friends, getGroup, getGroupMember, getStrangerByUin, groups, msgHistory, selfInfo } from "../common/data";
import { OB11ApiName, OB11Message, OB11Return, OB11MessageData, OB11Group, OB11GroupMember, OB11PostSendMsg, OB11MessageDataType, OB11User } from './types';
import { OB11Constructor } from "./constructor";
import { NTQQApi } from "../ntqqapi/ntcall";
import { Peer } from "../ntqqapi/ntcall";
import { SendMessageElement } from "../ntqqapi/types";
import { SendMsgElementConstructor } from "../ntqqapi/constructor";
import { uri2local } from "./utils";
import { v4 as uuid4 } from 'uuid';


// @SiberianHusky 2021-08-15
function checkSendMessage(sendMsgList: OB11MessageData[]) {
    function checkUri(uri: string): boolean {
        const pattern = /^(file:\/\/|http:\/\/|https:\/\/|base64:\/\/)/;
        return pattern.test(uri);
    }

    for (let msg of sendMsgList) {
        if (msg["type"] && msg["data"]) {
            let type = msg["type"];
            let data = msg["data"];
            if (type === "text" && !data["text"]) {
                return 400;
            } else if (["image", "voice", "record"].includes(type)) {
                if (!data["file"]) {
                    return 400;
                } else {
                    if (checkUri(data["file"])) {
                        return 200;
                    } else {
                        return 400;
                    }
                }

            } else if (type === "at" && !data["qq"]) {
                return 400;
            } else if (type === "reply" && !data["id"]) {
                return 400;
            }
        } else {
            return 400
        }
    }
    return 200;
}

// ==end==


class OB11Response {
    static res<T>(data: T, status: number = 0, message: string = ""): OB11Return<T> {
        return {
            status: status,
            retcode: status,
            data: data,
            message: message
        }
    }
    static ok<T>(data: T) {
        return OB11Response.res<T>(data)
    }
    static error(err: string) {
        return OB11Response.res(null, -1, err)
    }
}

const expressAPP = express();
expressAPP.use(express.urlencoded({ extended: true, limit: "500mb" }));

expressAPP.use((req, res, next) => {
    let data = '';
    req.on('data', chunk => {
        data += chunk.toString();
    });
    req.on('end', () => {
        if (data) {
            try {
                // log("receive raw", data)
                req.body = JSONbig.parse(data);
            } catch (e) {
                return next(e);
            }
        }
        next();
    });
});
// expressAPP.use(express.json({
//     limit: '500mb',
//     verify: (req: any, res: any, buf: any, encoding: any) => {
//         req.rawBody = buf;
//     }
// }));

export function startExpress(port: number) {

    expressAPP.get('/', (req: Request, res: Response) => {
        res.send('llonebot已启动');
    })

    expressAPP.listen(port, "0.0.0.0", () => {
        console.log(`llonebot started 0.0.0.0:${port}`);
    });
}


export function postMsg(msg: OB11Message) {
    const { reportSelfMessage } = getConfigUtil().getConfig()
    if (!reportSelfMessage) {
        if (msg.user_id == selfInfo.uin) {
            return
        }
    }
    for (const host of getConfigUtil().getConfig().hosts) {
        fetch(host, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-self-id": selfInfo.uin
            },
            body: JSON.stringify(msg)
        }).then((res: any) => {
            log(`新消息事件上报成功: ${host} ` + JSON.stringify(msg));
        }, (err: any) => {
            log(`新消息事件上报失败: ${host} ` + err + JSON.stringify(msg));
        });
    }
}

let routers: Record<string, (payload: any) => Promise<OB11Return<any>>> = {};

function registerRouter<PayloadType, ReturnDataType>(action: OB11ApiName, handle: (payload: PayloadType) => Promise<OB11Return<ReturnDataType | null>>) {
    let url = action.toString()
    if (!action.startsWith("/")) {
        url = "/" + action
    }
    async function _handle(res: Response, payload: PayloadType) {
        log("receive post data", url, payload)
        try {
            const result = await handle(payload)
            res.send(result)
        }
        catch (e) {
            log(e.stack);
            res.send(OB11Response.error(e.stack.toString()))
        }
    }

    expressAPP.post(url, (req: Request, res: Response) => {
        _handle(res, req.body).then()
    });
    expressAPP.get(url, (req: Request, res: Response) => {
        _handle(res, req.query as any).then()
    });
    routers[url] = handle
}

registerRouter<{ message_id: string }, OB11Message>("get_msg", async (payload) => {
    log("history msg ids", Object.keys(msgHistory));
    const msg = msgHistory[payload.message_id.toString()]
    if (msg) {
        const msgData = await OB11Constructor.message(msg);
        return OB11Response.ok(msgData)
    } else {
        return OB11Response.error("消息不存在")
    }
})

registerRouter<{}, OB11User>("get_login_info", async (payload) => {
    return OB11Response.ok(OB11Constructor.selfInfo(selfInfo));
})

registerRouter<{}, OB11User[]>("get_friend_list", async (payload) => {
    return OB11Response.ok(OB11Constructor.friends(friends));
})

registerRouter<{}, OB11Group[]>("get_group_list", async (payload) => {
    return OB11Response.ok(OB11Constructor.groups(groups));
})


registerRouter<{ group_id: number }, OB11Group[]>("get_group_info", async (payload) => {
    const group = await getGroup(payload.group_id.toString())
    if (group) {
        return OB11Response.ok(OB11Constructor.groups(groups));
    }
    else {
        return OB11Response.error(`群${payload.group_id}不存在`)
    }
})

registerRouter<{ group_id: number }, OB11GroupMember[]>("get_group_member_list", async (payload) => {

    const group = await getGroup(payload.group_id.toString());
    if (group) {
        if (!group.members?.length){
            group.members = await NTQQApi.getGroupMembers(payload.group_id.toString())
        }
        return OB11Response.ok(OB11Constructor.groupMembers(group));
    }
    else {
        return OB11Response.error(`群${payload.group_id}不存在`)
    }
})

registerRouter<{ group_id: number, user_id: number }, OB11GroupMember>("get_group_member_info", async (payload) => {
    const member = await getGroupMember(payload.group_id.toString(), payload.user_id.toString())
    if (member) {
        return OB11Response.ok(OB11Constructor.groupMember(payload.group_id.toString(), member))
    }
    else {
        return OB11Response.error(`群成员${payload.user_id}不存在`)
    }
})

const handleSendMsg = async (payload) => {
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

registerRouter<OB11PostSendMsg, { message_id: string }>("send_msg", handleSendMsg)
registerRouter<OB11PostSendMsg, { message_id: string }>("send_private_msg", handleSendMsg)
registerRouter<OB11PostSendMsg, { message_id: string }>("send_group_msg", handleSendMsg)