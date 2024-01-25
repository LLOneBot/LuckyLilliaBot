import {ipcMain, webContents} from 'electron';
import {PostDataSendMsg} from "../common/types";
import {CHANNEL_RECALL_MSG, CHANNEL_SEND_MSG} from "../common/IPCChannel";

function sendIPCMsg(channel: string, data: any) {
    let contents = webContents.getAllWebContents();
    for (const content of contents) {
        try {
            content.send(channel, data)
        } catch (e) {
            console.log("llonebot send ipc msg to render error:", e)
        }
    }
}


export function sendIPCSendQQMsg(postData: PostDataSendMsg) {
    sendIPCMsg(CHANNEL_SEND_MSG, postData);
}

export function sendIPCRecallQQMsg(message_id: string) {
    sendIPCMsg(CHANNEL_RECALL_MSG, {message_id});
}