// Electron 主进程 与 渲染进程 交互的桥梁

import {Group, PostDataSendMsg, User} from "./types";

const {contextBridge} = require("electron");
const {ipcRenderer} = require('electron');

// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("llonebot", {
    postData: (data: any) => {
        ipcRenderer.send("postOnebotData", data);
    },
    updateGroups: (groups: Group[]) => {
        ipcRenderer.send("updateGroups", groups);
    },
    updateFriends: (friends: User[]) => {
        ipcRenderer.send("updateFriends", friends);
    },
    updateGroupMembers: (data: {groupMembers: User[], group_id: string}) => {
        ipcRenderer.send("updateGroupMembers", data);
    },
    listenSendMessage: (handle: (jsonData: PostDataSendMsg) => void) => {
        ipcRenderer.on("llonebot_sendMsg", (event: any, args: PostDataSendMsg) => {
            handle(args)
        })
    },
    startExpress: () => {
        ipcRenderer.send("startExpress");
    },
    log: (data: any) => {
        ipcRenderer.send("log", data);
    }
    // startExpress,
});