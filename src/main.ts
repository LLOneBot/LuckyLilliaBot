// 运行在 Electron 主进程 下的插件入口

// import {Group, PostDataSendMsg, User} from "./types";
// type {Group, PostDataSendMsg, User} = import( "./types");
type Group = import( "./types").Group;
type PostDataSendMsg = import( "./types").PostDataSendMsg;
type User = import( "./types").User;

const express = require("express")
const {ipcMain, webContents} = require('electron');
const fs = require('fs');

const CHANNEL_SEND_MSG = "llonebot_sendMsg"

let groups: Group[] = []
let friends: User[] = []

function sendIPCMsg(channel: string, data: any){
    let contents = webContents.getAllWebContents();
    for (const content of contents) {
        try {
            content.send(channel, data)
        } catch (e) {
        }
    }
}

function sendIPCCallSendQQMsg(postData: PostDataSendMsg) {
    sendIPCMsg(CHANNEL_SEND_MSG, postData);
}

function log(msg: any){
    let currentDateTime = new Date().toLocaleString();
    fs.appendFile("./llonebot.log", currentDateTime + ":" + msg + "\n", (err: any) => {

    })
}



function startExpress(event: any) {
    // const original_send = (window.webContents.__qqntim_original_object && window.webContents.__qqntim_original_object.send) || window.webContents.send;
    const app = express();
    const port = 3000;

    // 中间件，用于解析POST请求的请求体
    app.use(express.urlencoded({extended: true}));
    app.use(express.json());

    app.get('/', (req: any, res: any) => {
        res.send('llonebot已启动');
    })
    // 处理POST请求的路由
    app.post('/', (req: any, res: any) => {
        let jsonData: PostDataSendMsg = req.body;
        let resData = {
            status: 0,
            retcode: 0,
            data: {},
            message: ''
        }
        if (jsonData.action == "send_private_msg" || jsonData.action == "send_group_msg") {
            sendIPCCallSendQQMsg(jsonData);
        }
        else if (jsonData.action == "get_group_list"){
            resData["data"] = groups.map(group => {
                return {
                    group_id: group.uid,
                    group_name: group.name
                }
            })
        }
        else if (jsonData.action == "get_group_member_list"){
            let group = groups.find(group => group.uid == jsonData.params.group_id)
            if (group){
                resData["data"] = group?.members?.map(member => {
                    return {
                        user_id: member.uin,
                        user_name: member.cardName || member.nick,
                        user_display_name: member.cardName || member.nick
                    }

                }) || []
            }
            else{
                resData["data"] = []
            }
        }
        else if (jsonData.action == "get_friend_list"){
            resData["data"] = friends.map(friend=>{
                return {
                    user_id: friend.uin,
                    user_name: friend.nickName,
                }
            })
        }
        res.send(resData)
    });
    app.listen(port, () => {
        console.log(`服务器已启动，监听端口 ${port}`);
    });
}


// 加载插件时触发
function onLoad(plugin: any) {
    ipcMain.on("startExpress", (event: any, arg: any) => {
        startExpress(event)
    })

    ipcMain.on("updateGroups", (event: any, arg: Group[]) => {
        groups = arg
    })

    ipcMain.on("updateFriends", (event: any, arg: User[]) => {
        friends = arg
    })

    ipcMain.on("postOnebotData", (event: any, arg: any) => {
            // try {
            //     // const fetch2 = require("./electron-fetch");
            // }catch (e) {
            //     log(e)
            // }
        log("开始post新消息事件到服务器")
        try {
            fetch("http://192.168.1.5:5000/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(arg)
            }).then((res: any) => {
                log("新消息事件上传");
            }, (err: any) => {
                log("新消息事件上传失败:" + err + JSON.stringify(arg));
            });
        }catch (e: any){
            log(e.toString())
        }
    })

    ipcMain.on("llonebot_log", (event: any, arg: any) => {
        log(arg)
    })
}


// 创建窗口时触发
function onBrowserWindowCreated(window: any, plugin: any) {

}


// 这两个函数都是可选的
module.exports = {
    onLoad,
    onBrowserWindowCreated
}