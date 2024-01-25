import {log} from "./utils";

const express = require("express");
const bodyParser = require('body-parser');
import {sendIPCRecallQQMsg, sendIPCSendQQMsg} from "./IPCSend";
import {OnebotGroupMemberRole, PostDataAction, PostDataSendMsg, SendMessage} from "../common/types";
import {friends, groups, selfInfo} from "./data";

// @SiberianHusky 2021-08-15
function checkSendMessage(sendMsgList: SendMessage[]) {
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
            } else if (["image", "voice"].includes(type)) {
                if (!data["file"]) {
                    return 400;
                }
                else{
                    if (checkUri(data["file"])) {
                        return 200;
                    }
                    else{
                        return 400;
                    }
                }

            } else if (type === "at" && !data["qq"]) {
                return 400;
            } else if (type === "reply" && !data["id"]) {
                return 400;
            }
        }
        else{
            return 400
        }
    }
    return 200;
}
// ==end==

function handlePost(jsonData: any) {
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
            sendIPCSendQQMsg(jsonData);
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
            role: OnebotGroupMemberRole[member.role],
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
                    role: OnebotGroupMemberRole[member.role],
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
    app.use(bodyParser({limit: '500mb'}))
    app.use(express.json());

    function parseToOnebot12(action: PostDataAction) {
        app.post('/' + action, (req: any, res: any) => {
            let jsonData: PostDataSendMsg = req.body;
            jsonData.action = action
            let resData = handlePost(jsonData)
            res.send(resData)
        });
    }

    const actionList: PostDataAction[] = ["get_login_info", "send_private_msg", "send_group_msg",
        "get_group_list", "get_friend_list", "delete_msg", "get_group_member_list", "get_group_member_info"]

    for (const action of actionList) {
        parseToOnebot12(action as PostDataAction)
    }

    app.get('/', (req: any, res: any) => {
        res.send('llonebot已启动');
    })


    // 处理POST请求的路由
    app.post('/', (req: any, res: any) => {
        let jsonData: PostDataSendMsg = req.body;
        let resData = handlePost(jsonData)
        res.send(resData)
    });
    app.post('/send_msg', (req: any, res: any) => {
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
        let resData = handlePost(jsonData)
        res.send(resData)
    })

    app.listen(port, "0.0.0.0", () => {
        console.log(`服务器已启动，监听端口 ${port}`);
    });
}