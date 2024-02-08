import {getConfigUtil, log} from "../common/utils";

// const express = require("express");
import express = require("express");
import {Request} from 'express';
import {Response} from 'express';

const JSONbig = require('json-bigint');
import {sendIPCRecallQQMsg, sendIPCSendQQMsg} from "../main/ipcsend";
import {PostDataSendMsg} from "../common/types";
import {friends, groups, msgHistory, selfInfo} from "../common/data";
import {OB11ApiName, OB11Message, OB11Return, OB11MessageData} from "../onebot11/types";
import {OB11Constructor} from "../onebot11/constructor";


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

function constructReturnData(status: number, data: any = {}, message: string = "") {
    return {
        status: status,
        retcode: status,
        data: data,
        message: message
    }

}

function handlePost(jsonData: any, handleSendResult: (data: OB11Return<any>) => void) {
    log("API receive post:" + JSON.stringify(jsonData))
    if (!jsonData.params) {
        jsonData.params = JSON.parse(JSON.stringify(jsonData));
        delete jsonData.params.params;
    }
    let resData = {
        status: 0,
        retcode: 0,
        data: {},
        message: ''
    }

    if (jsonData.action == "get_login_info") {
        resData["data"] = selfInfo
    } else if (jsonData.action == "send_private_msg" || jsonData.action == "send_group_msg") {
        if (jsonData.action == "send_private_msg") {
            jsonData.message_type = "private"
        } else {
            jsonData.message_type = "group"
        }
        // @SiberianHuskY 2021-10-20 22:00:00
        resData.status = checkSendMessage(jsonData.message);
        if (resData.status == 200) {
            resData.message = "发送成功";
            resData.data = jsonData.message;
            sendIPCSendQQMsg(jsonData, handleSendResult);
            return;
        } else {
            resData.message = "发送失败, 请检查消息格式";
            resData.data = jsonData.message;
        }
        // == end ==
    } else if (jsonData.action == "get_group_list") {
        resData["data"] = groups.map(group => {
            return {
                group_id: group.uid,
                group_name: group.name,
                member_count: group.members.length,
                group_members: group.members.map(member => {
                    return {
                        user_id: member.uin,
                        user_name: member.cardName || member.nick,
                        user_display_name: member.cardName || member.nick
                    }
                })
            }
        })
    } else if (jsonData.action == "get_group_info") {
        let group = groups.find(group => group.uid == jsonData.params.group_id)
        if (group) {
            resData["data"] = {
                group_id: group.uid,
                group_name: group.name,
                member_count: group.members.length,
            }
        }
    } else if (jsonData.action == "get_group_member_info") {
        let member = groups.find(group => group.uid == jsonData.params.group_id)?.members?.find(member => member.uin == jsonData.params.user_id)
        resData["data"] = {
            user_id: member.uin,
            user_name: member.nick,
            user_display_name: member.cardName || member.nick,
            nickname: member.nick,
            card: member.cardName,
            role: OB11Constructor.groupMemberRole(member.role),
        }
    } else if (jsonData.action == "get_group_member_list") {
        let group = groups.find(group => group.uid == jsonData.params.group_id)
        if (group) {
            resData["data"] = group?.members?.map(member => {
                return {
                    user_id: member.uin,
                    user_name: member.nick,
                    user_display_name: member.cardName || member.nick,
                    nickname: member.nick,
                    card: member.cardName,
                    role: OB11Constructor.groupMemberRole(member.role),
                }

            }) || []
        } else {
            resData["data"] = []
        }
    } else if (jsonData.action == "get_friend_list") {
        resData["data"] = friends.map(friend => {
            return {
                user_id: friend.uin,
                user_name: friend.nickName,
            }
        })
    } else if (jsonData.action == "delete_msg") {
        sendIPCRecallQQMsg(jsonData.message_id)
    }
    return resData
}


export function startExpress(port: number) {
    const app = express();
    // 中间件，用于解析POST请求的请求体
    app.use(express.urlencoded({extended: true, limit: "500mb"}));
    app.use(express.json({
        limit: '500mb',
        verify: (req: any, res: any, buf: any, encoding: any) => {
            req.rawBody = buf;
        }
    }));
    app.use((req: any, res: any, next: any) => {
        try {
            req.body = JSONbig.parse(req.rawBody.toString());
            next();
        } catch (error) {
            // next(error);
            next();
        }
    });

    async function registerRouter<PayloadType, ReturnDataType>(action: OB11ApiName, handle: (payload: PayloadType) => Promise<OB11Return<ReturnDataType>>) {
        let url = action.toString()
        if (!action.startsWith("/")){
            url = "/" + action
        }
        async function _handle(res: Response, payload: PayloadType) {
            res.send(await handle(payload))
        }

        app.post(url, (req: Request, res: Response) => {
            _handle(res, req.body).then()
        });
        app.get(url, (req: Request, res: Response) => {
            _handle(res, req.query as any).then()
        });
    }

    function parseToOnebot12(action: OB11ApiName) {
        app.post('/' + action, (req: Request, res: Response) => {
            let jsonData: PostDataSendMsg = req.body;
            jsonData.action = action
            let resData = handlePost(jsonData, (data: OB11Return<any>) => {
                res.send(data)
            })
            if (resData) {
                res.send(resData)
            }
        });
    }

    const actionList: OB11ApiName[] = ["get_login_info", "send_private_msg", "send_group_msg",
        "get_group_list", "get_friend_list", "delete_msg", "get_group_member_list", "get_group_member_info"]

    for (const action of actionList) {
        parseToOnebot12(action as OB11ApiName)
    }

    app.get('/', (req: Request, res: Response) => {
        res.send('llonebot已启动');
    })


    // 处理POST请求的路由
    app.post('/', (req: Request, res: Response) => {
        let jsonData: PostDataSendMsg = req.body;
        let resData = handlePost(jsonData, (data: OB11Return<any>) => {
            res.send(data)
        })
        if (resData) {
            res.send(resData)
        }
    });
    app.post('/send_msg', (req: Request, res: Response) => {
        let jsonData: PostDataSendMsg = req.body;
        if (jsonData.message_type == "private") {
            jsonData.action = "send_private_msg"
        } else if (jsonData.message_type == "group") {
            jsonData.action = "send_group_msg"
        } else {
            if (jsonData.params.group_id) {
                jsonData.action = "send_group_msg"
            } else {
                jsonData.action = "send_private_msg"
            }
        }
        let resData = handlePost(jsonData, (data: OB11Return<any>) => {
            res.send(data)
        })
        if (resData) {
            res.send(resData)
        }
    })

    registerRouter<{ message_id: string }, OB11Message>("get_msg", async (payload) => {
        const msg = msgHistory[payload.message_id.toString()]
        if (msg) {
            const msgData = await OB11Constructor.message(msg);
            return constructReturnData(0, msgData)
        } else {
            return constructReturnData(1, {}, "消息不存在")
        }
    }).then(()=>{

    })

    app.listen(port, "0.0.0.0", () => {
        console.log(`llonebot started 0.0.0.0:${port}`);
    });
}


export function postMsg(msg: OB11Message) {
    const {reportSelfMessage} = getConfigUtil().getConfig()
    if (!reportSelfMessage) {
        if (msg.user_id == selfInfo.user_id) {
            return
        }
    }
    for (const host of getConfigUtil().getConfig().hosts) {
        fetch(host, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-self-id": selfInfo.user_id
            },
            body: JSON.stringify(msg)
        }).then((res: any) => {
            log(`新消息事件上报成功: ${host} ` + JSON.stringify(msg));
        }, (err: any) => {
            log(`新消息事件上报失败: ${host} ` + err + JSON.stringify(msg));
        });
    }
}