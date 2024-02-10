import {ipcMain, webContents} from 'electron';
import {OB11PostSendMsg} from "../onebot11/types"
import {CHANNEL_RECALL_MSG, CHANNEL_SEND_MSG,CHANNEL_SEND_BACK_MSG} from "../common/channels";
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

export interface SendIPCMsgSession<T> {
    id: string
    data: T
}

export function sendIPCSendQQMsg(postData: OB11PostSendMsg, handleSendResult: (data: OB11Return<any>) => void) {
    const onceSessionId = uuid4();
    const handler = (event: any, session: SendIPCMsgSession<OB11Return<any>>) => {
        // log("llonebot send msg ipcMain.once:" + JSON.stringify(sendResult));
        if (session?.id !== onceSessionId) {
            return
        }
        try {
            handleSendResult(session.data)
            ipcMain.off(CHANNEL_SEND_BACK_MSG, handler)
            return
        } catch (e) {
            log("llonebot send msg sendIPCSendQQMsg handler error:" + JSON.stringify(e))
        }
    }
    ipcMain.on(CHANNEL_SEND_BACK_MSG, handler)
    sendIPCMsg(CHANNEL_SEND_MSG, {
        id: onceSessionId,
        data: postData,
    });
}

export function sendIPCRecallQQMsg(message_id: string) {
    sendIPCMsg(CHANNEL_RECALL_MSG, { message_id: message_id });
}