// Electron 主进程 与 渲染进程 交互的桥梁

import {Config} from "./common/types";
import {CHANNEL_GET_CONFIG, CHANNEL_LOG, CHANNEL_SET_CONFIG,} from "./common/channels";


const {contextBridge} = require("electron");
const {ipcRenderer} = require('electron');

// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("llonebot", {
    log: (data: any) => {
        ipcRenderer.send(CHANNEL_LOG, data);
    },
    setConfig: (config: Config)=>{
        ipcRenderer.send(CHANNEL_SET_CONFIG, config);
    },
    getConfig: async () => {
        return ipcRenderer.invoke(CHANNEL_GET_CONFIG);
    },
});