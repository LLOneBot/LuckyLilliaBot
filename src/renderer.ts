/// <reference path="./global.d.ts" />

// import express from "express";
// const { ipcRenderer } = require('electron');
import {Group, MessageElement, Peer, PostDataSendMsg, User} from "./types";

const host = "http://localhost:5000"

let self_qq: string = ""
let groups: Group[] = []
let friends: User[] = []
let uid_maps: Record<string, User> = {}  // 一串加密的字符串 -> qq号
async function getUserInfo(uid: string): Promise<User> {
    let user = uid_maps[uid]
    if (!user) {
        // 从服务器获取用户信息
        user = await window.LLAPI.getUserInfo(uid)
        uid_maps[uid] = user
    }
    return user
}

function getFriend(qq: string) {
    return friends.find(friend => friend.uid == qq)
}

async function getGroup(qq: string) {
    let group = groups.find(group => group.uid == qq)
    if (!group) {
        await getGroups();
        group = groups.find(group => group.uid == qq)
    }
    return group
}

async function getGroups() {
    let __groups = await window.LLAPI.getGroupsList(false)
    for (let group of __groups) {
        group.members = [];
        let existGroup = groups.find(g => g.uid == group.uid)
        if (!existGroup) {
            console.log("更新群列表", groups)
            groups.push(group)
            window.llonebot.updateGroups(groups)
        }
    }
    return groups
}

async function getGroupMembers(group_qq: string, forced: boolean = false) {
    let group = await getGroup(group_qq)
    if (!group?.members || group!.members!.length == 0 || forced) {
        let res = (await window.LLAPI.getGroupMemberList(group_qq + "_groupMemberList_MainWindow", 5000))
        // console.log(`更新群${group}成员列表 await`, _res)
        // window.LLAPI.getGroupMemberList(group_qq + "_groupMemberList_MainWindow", 5000).then(res =>{
        let members = res.result.infos.values();
        if (members && forced) {
            group!.members = []
        }
        for (const member of members) {
            if (!group!.members!.find(m => m.uid == member.uid)) {
                group!.members!.push(member)
            }
        }
        window.llonebot.updateGroups(groups)
        console.log(`更新群${group}成员列表`, group)
        // })
    }
    return group?.members
}

async function getGroupMember(group_qq: string, member_uid: string) {
    let members = await getGroupMembers(group_qq)
    if (members) {
        let member = members.find(member => member.uid == member_uid)
        if (!member) {
            members = await getGroupMembers(group_qq, true)
            member = members?.find(member => member.uid == member_uid)
        }
        return member
    }
}


async function forwardMessage(message: MessageElement) {
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
        // let group: Group
        if (message.peer.chatType == "group") {
            let group_id = message.peer.uid
            let group = (await getGroup(group_id))!
            onebot_message_data["group_id"] = message.peer.uid
            let groupMember = await getGroupMember(group_id, message.sender.uid)
            onebot_message_data["user_id"] = groupMember!.uin
            console.log("收到群消息", onebot_message_data)
        } else if (message.peer.chatType == "private") {
            onebot_message_data["user_id"] = message.peer.uid
        }
        for (let element of message.raw.elements) {
            let message_data: any = {
                data: {},
                type: "unknown"
            }

            if (element.textElement?.atType == 2) {
                message_data["type"] = "at"
                if (element.textElement.atUid != "0") {
                    message_data["data"]["mention"] = element.textElement.atUid
                } else {
                    let uid = element.textElement.atNtUid
                    let atMember = await getGroupMember(message.peer.uid, uid)
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
        console.log("new message raw", message)
        forwardMessage(message).then();
    }
}

async function listenSendMessage(postData: PostDataSendMsg) {
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
            let group = await getGroup(postData.params.group_id)
            if (group) {
                peer = {
                    chatType: "group",
                    name: group.name,
                    uid: group.uid
                }
            } else {
                console.log("未找到群, 发送群消息失败", postData)
            }
        }
        if (peer) {
            window.LLAPI.sendMessage(peer, postData.params.message).then(res => console.log("消息发送成功:", res),
                err => console.log("消息发送失败", postData, err))
        }
    }
}

let chatListEle: HTMLCollectionOf<Element>

function onLoad() {
    window.llonebot.startExpress();
    window.llonebot.listenSendMessage((postData: PostDataSendMsg) => {
        listenSendMessage(postData).then()
    });
    getGroups().then()

    function onNewMessages(messages: MessageElement[]) {
        async function func(messages: MessageElement[]) {
            console.log("收到新消息", messages)
            if (!self_qq) {
                self_qq = (await window.LLAPI.getAccountInfo()).uin
            }
            await handleNewMessage(messages);
        }

        func(messages).then(() => {
        })
        console.log("chatListEle", chatListEle)
    }

    window.LLAPI.on("new-messages", onNewMessages);

    try {
        window.LLAPI.add_qmenu((qContextMenu: Node) => {
            let btn = document.createElement("a")
            btn.className = "q-context-menu-item q-context-menu-item--normal vue-component"
            btn.setAttribute("aria-disabled", "false")
            btn.setAttribute("role", "menuitem")
            btn.setAttribute("tabindex", "-1")
            btn.onclick = ()=>{
                // window.LLAPI.getPeer().then(peer => {
                //     // console.log("current peer", peer)
                //     if (peer && peer.chatType == "group") {
                //         getGroupMembers(peer.uid, true).then(()=> {
                //             console.log("获取群成员列表成功", groups);
                //             alert("获取群成员列表成功")
                //         })
                //     }
                // })
                window.LLAPI.getGroupMemberList("164461995", 5000).then(res =>{
                    console.log("获取群成员列表结果", res)
                })
            }
            btn.innerText = "获取群成员列表"
            console.log(qContextMenu)
            // qContextMenu.appendChild(btn)
            // qContextMenu.insertAdjacentHTML("beforeend", btn)
        })
    }catch (e){
        console.log(e)
    }

    window.LLAPI.on("context-msg-menu", (event, target, msgIds) => {
        // console.log("msg menu", event, target, msgIds);
        // 消息右键菜单添加一个获取群成员列表的按钮
    })

    // console.log("getAccountInfo", LLAPI.getAccountInfo());
    function getChatListEle() {
        chatListEle = document.getElementsByClassName("viewport-list__inner")
        console.log("chatListEle", chatListEle)
        if (chatListEle.length == 0) {
            setTimeout(getChatListEle, 500)
        } else {
            // try {
            //     // 选择要观察的目标节点
            //     const targetNode = chatListEle[0];
            //
            //     // 创建一个观察器实例并传入回调函数
            //     const observer = new MutationObserver(function (mutations) {
            //         mutations.forEach(function (mutation) {
            //             // console.log("chat list changed", mutation.type); // 输出 mutation 的类型
            //             // 获得当前聊天窗口
            //             window.LLAPI.getPeer().then(peer => {
            //                 // console.log("current peer", peer)
            //                 if (peer && peer.chatType == "group"){
            //                     getGroupMembers(peer.uid, false).then()
            //                 }
            //             })
            //         });
            //     });
            //
            //     // 配置观察选项
            //     const config = {attributes: true, childList: true, subtree: true};
            //
            //     // 传入目标节点和观察选项
            //     observer.observe(targetNode, config);
            //
            // }catch (e) {
            //     window.llonebot.log(e)
            // }
        }
    }

    // getChatListEle();
}

// 打开设置界面时触发
function onConfigView(view: any) {

}

export {
    onLoad,
    onConfigView
}