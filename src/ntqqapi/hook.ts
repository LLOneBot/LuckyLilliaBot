import {BrowserWindow} from 'electron';
import {getConfigUtil, log} from "../common/utils";
import {NTQQApiClass, sendMessagePool} from "./ntcall";
import { Group } from "./types";
import { RawMessage } from "./types";
import {groups, msgHistory} from "../common/data";

export let hookApiCallbacks: Record<string, (apiReturn: any)=>void>={}

export enum ReceiveCmd {
    UPDATE_MSG = "nodeIKernelMsgListener/onMsgInfoListUpdate",
    NEW_MSG = "nodeIKernelMsgListener/onRecvMsg",
    SELF_SEND_MSG = "nodeIKernelMsgListener/onAddSendMsg",
    USER_INFO = "nodeIKernelProfileListener/onProfileDetailInfoChanged",
    GROUPS = "nodeIKernelGroupListener/onGroupListUpdate",
    GROUPS_UNIX = "onGroupListUpdate"
}

interface NTQQApiReturnData<PayloadType=unknown> extends Array<any> {
    0: {
        "type": "request",
        "eventName": NTQQApiClass,
        "callbackId"?: string
    },
    1:
        {
            cmdName: ReceiveCmd,
            cmdType: "event",
            payload: PayloadType
        }[]
}

let receiveHooks: Array<{
    method: ReceiveCmd,
    hookFunc: (payload: any) => void
}> = []

export function hookNTQQApiReceive(window: BrowserWindow) {
    const originalSend = window.webContents.send;
    const patchSend = (channel: string, ...args: NTQQApiReturnData) => {
        // 判断是否是列表
        log(`received ntqq api message: ${channel}`, JSON.stringify(args))
        if (args?.[1] instanceof Array) {
            for (let receiveData of args?.[1]) {
                const ntQQApiMethodName = receiveData.cmdName;
                // log(`received ntqq api message: ${channel} ${ntQQApiMethodName}`, JSON.stringify(receiveData))
                for (let hook of receiveHooks) {
                    if (hook.method === ntQQApiMethodName) {
                        new Promise((resolve, reject) => {
                            try {
                                hook.hookFunc(receiveData.payload);
                            }catch (e) {
                                log("hook error", e, receiveData.payload)
                            }
                        }).then()
                    }
                }
            }
        }
        if (args[0]?.callbackId){
            // log("hookApiCallback", hookApiCallbacks, args)
            const callbackId = args[0].callbackId;
            if (hookApiCallbacks[callbackId]){
                // log("callback found")
                new Promise((resolve, reject) => {
                    hookApiCallbacks[callbackId](args[1]);
                }).then()
                delete hookApiCallbacks[callbackId];
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

function updateGroups(_groups: Group[]){
    for(let group of _groups){
        let existGroup = groups.find(g=>g.groupCode == group.groupCode)
        if (!existGroup){
            groups.push(group)
        }
        else{
            Object.assign(existGroup, group);
        }
    }
}

registerReceiveHook<{groupList: Group[]}>(ReceiveCmd.GROUPS, (payload)=>updateGroups(payload.groupList))
registerReceiveHook<{groupList: Group[]}>(ReceiveCmd.GROUPS_UNIX, (payload)=>updateGroups(payload.groupList))

registerReceiveHook<any>(ReceiveCmd.USER_INFO, (payload)=>{
    log("user info", payload);
})

registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.UPDATE_MSG, (payload) => {
    for (const message of payload.msgList) {
        msgHistory[message.msgId] = message;
    }
})

registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.NEW_MSG, (payload) => {
    for (const message of payload.msgList) {
        log("收到新消息，push到历史记录", message)
        if (!msgHistory[message.msgId]){
            msgHistory[message.msgId] = message
        }
        else{
            Object.assign(msgHistory[message.msgId], message)
        }
    }
})

registerReceiveHook<{msgRecord: RawMessage}>(ReceiveCmd.SELF_SEND_MSG, ({msgRecord})=>{
    const message = msgRecord;
    const peerUid = message.peerUid;
    // log("收到自己发送成功的消息", Object.keys(sendMessagePool), message);
    const sendCallback = sendMessagePool[peerUid];
    if (sendCallback){
        try{
            sendCallback(message);
        }catch(e){
            log("receive self msg error", e.stack)
        }
    }
})
