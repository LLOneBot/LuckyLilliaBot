// Electron 主进程 与 渲染进程 交互的桥梁
const { contextBridge } = require("electron");
const { ipcRenderer } = require('electron');

// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("llonebot", {
    listenSendMessage: (handle: (msg: any)=>void)=>{
        ipcRenderer.on("sendMsg", (event: any, args: any) => {
            handle("收到ipc消息：发送消息")
            console.log("收到ipc消息：发送消息", args); // 处理主进程发送的消息
        })
    },
    startExpress:()=>{
        ipcRenderer.send("startExpress");
    }
    // startExpress,
});