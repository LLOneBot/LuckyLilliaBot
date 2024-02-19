import {webContents} from 'electron';
import {CHANNEL_LOG} from '../common/channels';


function sendIPCMsg(channel: string, ...data: any) {
    let contents = webContents.getAllWebContents();
    for (const content of contents) {
        try {
            content.send(channel, ...data)
        } catch (e) {
            console.log("llonebot send ipc msg to render error:", e)
        }
    }
}

export function sendLog(...args){
    sendIPCMsg(CHANNEL_LOG, ...args)
}
