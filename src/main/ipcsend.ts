import {ipcMain, webContents} from 'electron';
import {PostDataSendMsg} from "../common/types";
import {CHANNEL_RECALL_MSG, CHANNEL_SEND_MSG} from "../common/channels";
import {v4 as uuid4} from "uuid";
import {log} from "../common/utils";


import {OB11Return} from "../onebot11/types";

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


export function sendIPCSendQQMsg(postData: PostDataSendMsg, handleSendResult: (data: OB11Return<any>) => void) {
    const onceSessionId = "llonebot_send_msg_" + uuid4();
    postData.ipc_uuid = onceSessionId;
    ipcMain.once(onceSessionId, (event: any, sendResult: OB11Return<any>) => {
        // log("llonebot send msg ipcMain.once:" + JSON.stringify(sendResult));
        try {
            handleSendResult(sendResult)
        } catch (e) {
            log("llonebot send msg ipcMain.once error:" + JSON.stringify(e))
        }
    })
    sendIPCMsg(CHANNEL_SEND_MSG, postData);
}

export function sendIPCRecallQQMsg(message_id: string) {
    sendIPCMsg(CHANNEL_RECALL_MSG, {message_id: message_id});
}