// Electron 主进程 与 渲染进程 交互的桥梁

const {contextBridge} = require("electron");
const {ipcRenderer} = require('electron');

// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("llonebot", {
    listenSendMessage: (handle: (jsonData: PostDataSendMsg) => void) => {
        ipcRenderer.on("sendMsg", (event: any, args: PostDataSendMsg) => {
            handle(args)
        })
    },
    startExpress: () => {
        ipcRenderer.send("startExpress");
    }
    // startExpress,
});