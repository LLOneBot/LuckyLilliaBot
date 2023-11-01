/// <reference path="./global.d.ts" />

// import express from "express";
// const { ipcRenderer } = require('electron');
import {AtType, Group, MessageElement, Peer, PostDataSendMsg, User} from "./types";

const host = "http://localhost:5000"

let self_qq: string = ""
let groups: Group[] = []
let friends: User[] = []
let uid_maps: Record<string, User> = {}  // 一串加密的字符串 -> qq号
async function getUserInfo(uid: string): Promise<User>{
    let user = uid_maps[uid]
    if (!user){
        // 从服务器获取用户信息
        user = await window.LLAPI.getUserInfo(uid)
        uid_maps[uid] = user
    }
    return user
}

function getFriend(qq: string) {
    return friends.find(friend => friend.uid == qq)
}

function getGroup(qq: string) {
    return groups.find(group => group.uid == qq)
}



function forwardMessage(message: MessageElement) {
    try {
        let onebot_message_data: any = {
            self: {
                platform: "qq",
                user_id: self_qq
            },
            time: 0,
            type: "message",
            detail_type: message.peer.chatType,
            sub_type: "",
            message: []
        }
        let group: Group
        if (message.peer.chatType == "group") {
            let group_id = message.peer.uid
            group = groups.find(group => group.uid == group_id)!
            onebot_message_data["group_id"] = message.peer.uid
            let groupMember = group.members!.find(member => member.uid == message.sender.uid)
            if (groupMember) {
                console.log("群成员信息存在，使用群成员信息")
                onebot_message_data["user_id"] = groupMember.uin
            }
            else{
                console.log("群成员信息不存在，使用原始uid")
                onebot_message_data["user_id"] = message.sender.uid
            }
            console.log("收到群消息", onebot_message_data)
        } else if (message.peer.chatType == "private") {
            onebot_message_data["user_id"] = message.peer.uid
        }
        for (let element of message.raw.elements) {
            let message_data: any = {
                data: {}
            }

            if (element.textElement?.atType == AtType.atUser) {
                message_data["type"] = "at"
                if (element.textElement.atUid != "0") {
                    message_data["data"]["mention"] = element.textElement.atUid
                } else {
                    let uid = element.textElement.atNtUid
                    let atMember = group!.members!.find(member => member.uid == uid)
                    message_data["data"]["mention"] = atMember!.uin
                }
            } else if (element.textElement) {
                message_data["type"] = "text"
                message_data["data"]["text"] = element.textElement.content
            } else if (element.picElement) {
                message_data["type"] = "image"
                message_data["data"]["file_id"] = element.picElement.fileUuid
                message_data["data"]["path"] = element.picElement.sourcePath
            } else if (element.replyElement) {
                message_data["type"] = "reply"
                message_data["data"]["reply"] = element.replyElement.sourceMsgIdInRecords
            }
            onebot_message_data.message.push(message_data)
        }

        console.log("发送上传消息给ipc main", onebot_message_data)
        window.llonebot.postData(onebot_message_data);
    } catch (e) {
        console.log("上传消息事件失败", e)
    }
}

async function handleNewMessage(messages: MessageElement[]) {
    for (let message of messages) {
        if (message.peer.chatType == "group") {
            let group = groups.find(group => group.uid == message.peer.uid)
            if (!group) {
                let members = (await window.LLAPI.getGroupMemberList(message.peer.uid + "_groupMemberList_MainWindow", 5000)).result.infos
                let membersList = Object.values(members)
                group = {
                    name: message.peer.name,
                    uid: message.peer.uid,
                    members: membersList
                }
                groups.push(group)
                window.llonebot.updateGroups(groups);
            }
        }
        forwardMessage(message);
    }
}

async function getGroups(){
    groups = await window.LLAPI.getGroupsList(false)
    for (let group of groups) {
        group.members = [];
    }
    window.llonebot.updateGroups(groups)
}

function onLoad() {
    window.llonebot.startExpress();
    window.llonebot.listenSendMessage((postData: PostDataSendMsg) => {
        if (postData.action == "send_private_msg" || postData.action == "send_group_msg") {
            let peer: Peer | null = null;
            if (postData.action == "send_private_msg") {
                let friend = getFriend(postData.params.user_id)
                if (friend) {
                    peer = {
                        chatType: "private",
                        name: friend.nickName,
                        uid: friend.uin
                    }
                }
            } else if (postData.action == "send_group_msg") {
                let group = getGroup(postData.params.group_id)
                if (group) {
                    peer = {
                        chatType: "group",
                        name: group.name,
                        uid: group.uid
                    }
                }
            }
            if (peer) {
                window.LLAPI.sendMessage(peer, postData.params.message).then(res => console.log("消息发送成功:", res),
                    err => console.log("消息发送失败", postData, err))
            }
        }
    });
    getGroups().then()
    function onNewMessages(messages: MessageElement[]){
        async function func(messages: MessageElement[]){
            console.log("收到新消息", messages)
            if (!self_qq) {
                self_qq = (await window.LLAPI.getAccountInfo()).uin
            }
            await handleNewMessage(messages);
        }
        func(messages).then(() => {})
    }

    window.LLAPI.on("new-messages", onNewMessages);

    // console.log("getAccountInfo", LLAPI.getAccountInfo());
}

// 打开设置界面时触发
function onConfigView(view: any) {

}

export {
    onLoad,
    onConfigView
}