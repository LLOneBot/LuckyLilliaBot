/// <reference path="./renderer.d.ts" />

// import express from "express";
// const { ipcRenderer } = require('electron');

const host = "http://localhost:5000"

let groups: Group[] = []
let friends: User[] = []

function getFriend(qq: string){
    return friends.find(friend => friend.uid == qq)
}

function getGroup(qq: string) {
    return groups.find(group => group.uid == qq)
}

let self_qq: string = ""

let uid_maps: Record<string, string> = {}  // 一串加密的字符串 -> qq号

function onLoad(){
    llonebot.startExpress();
    window.LLAPI.getAccountInfo().then(accountInfo => {
        self_qq = accountInfo.uid
    })

    window.LLAPI.getGroupsList(false).then(groupsList => {
        groups = groupsList
    })
    window.LLAPI.on("new-messages", (messages) => {
        try{
            llonebot.listenSendMessage(console.log);
            console.log("ipc监听成功")
        } catch (e){
            console.log("ipc监听失败", e)
        }
        messages.forEach(message => {
            let onebot_message_data: any = {
                self: {
                    platform: "qq",
                    user_id: self_qq
                },
                time: 0,
                type: "message",
                detail_type: message.peer.chatType,
                sub_type: "",
                message: message.raw.elements.map(element=>{
                    let message_data: any =  {
                        data: {}
                    }
                    if (element.raw.textElement?.atType == AtType.atUser){
                        message_data["type"] = "at"
                        message_data["data"]["mention"] = element.raw.textElement.atUid
                    }
                    else if (element.raw.textElement){
                        message_data["type"] = "text"
                        message_data["data"]["text"] = element.raw.textElement.content
                    }
                    else if (element.raw.picElement){
                        message_data["type"] = "image"
                        message_data["data"]["file_id"] = element.raw.picElement.fileUuid
                        message_data["data"]["path"] = element.raw.picElement.sourcePath
                    }
                    else if (element.raw.replyElement){
                        message_data["type"] = "reply"
                        message_data["data"]["reply"] = element.raw.replyElement.sourceMsgIdInRecords
                    }
                    return message_data
                })
            }

            if (message.peer.chatType == "group"){
                onebot_message_data["group_id"] = message.peer.uid
                // todo: 将加密的uid转成qq号
                onebot_message_data["user_id"] = message.sender.uid
            }
            else if (message.peer.chatType == "private"){
                onebot_message_data["user_id"] = message.peer.uid
            }

            fetch(host + "", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(onebot_message_data)
            }).then(res => {}, err => {
                console.log(err)
            })
        });
    });
    // console.log("getAccountInfo", LLAPI.getAccountInfo());
}

// 打开设置界面时触发
function onConfigView(view: any) {

}

export {
    onLoad,
    onConfigView
}