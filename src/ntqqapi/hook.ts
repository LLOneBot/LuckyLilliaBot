import {BrowserWindow} from 'electron';
import {getConfigUtil, log} from "../common/utils";
import {NTQQApiClass} from "./ntcall";
import {RawMessage} from "../common/types";
import {msgHistory} from "../common/data";

export enum ReceiveCmd {
    UPDATE_MSG = "nodeIKernelMsgListener/onMsgInfoListUpdate",
    NEW_MSG = "nodeIKernelMsgListener/onRecvMsg",
    SELF_SEND_MSG = "nodeIKernelMsgListener/onAddSendMsg"
}

interface NTQQApiReturnData extends Array<any> {
    0: {
        "type": "request",
        "eventName": NTQQApiClass
    },
    1:
        {
            cmdName: ReceiveCmd,
            cmdType: "event",
            payload: unknown
        }[]
}

let receiveHooks: Array<{
    method: ReceiveCmd,
    hookFunc: (payload: unknown) => void
}> = []

export function hookNTQQApiReceive(window: BrowserWindow) {
    const originalSend = window.webContents.send;
    const patchSend = (channel: string, ...args: NTQQApiReturnData) => {
        // 判断是否是列表
        if (args?.[1] instanceof Array) {
            for (let receiveData of args?.[1]) {
                const ntQQApiMethodName = receiveData.cmdName;
                // log(`received ntqq api message: ${channel} ${ntQQApiMethodName}`, JSON.stringify(receiveData))
                for (let hook of receiveHooks) {
                    if (hook.method === ntQQApiMethodName) {
                        hook.hookFunc(receiveData.payload);
                    }
                }
            }
        }

        return originalSend.call(window.webContents, channel, ...args);
    }
    window.webContents.send = patchSend;
}

export function registerReceiveHook<PayloadType>(method: ReceiveCmd, hookFunc: (payload: PayloadType) => void) {
    receiveHooks.push({
        method,
        hookFunc
    })
}

registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.UPDATE_MSG, (payload) => {
    for (const message of payload.msgList) {
        msgHistory[message.msgId] = message;
    }
})

registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.NEW_MSG, (payload) => {
    for (const message of payload.msgList) {
        log("收到新消息，push到历史记录", message)
        msgHistory[message.msgId] = message;
    }
})

