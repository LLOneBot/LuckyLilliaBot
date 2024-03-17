import {BrowserWindow} from 'electron';
import {getConfigUtil, log, sleep} from "../common/utils";
import {NTQQApiClass} from "./ntcall";
import {sendMessagePool} from "./api/msg"
import {Group, RawMessage, User} from "./types";
import {friends, groups, selfInfo, tempGroupCodeMap} from "../common/data";
import {OB11GroupDecreaseEvent} from "../onebot11/event/notice/OB11GroupDecreaseEvent";
import {v4 as uuidv4} from "uuid"
import {postOB11Event} from "../onebot11/server/postOB11Event";
import {HOOK_LOG} from "../common/config";
import fs from "fs";
import {dbUtil} from "../common/db";
import {NTQQGroupApi} from "./api/group";

export let hookApiCallbacks: Record<string, (apiReturn: any) => void> = {}

export let ReceiveCmdS = {
    UPDATE_MSG: "nodeIKernelMsgListener/onMsgInfoListUpdate",
    UPDATE_ACTIVE_MSG: "nodeIKernelMsgListener/onActiveMsgInfoUpdate",
    NEW_MSG: `nodeIKernelMsgListener/onRecvMsg`,
    NEW_ACTIVE_MSG: `nodeIKernelMsgListener/onRecvActiveMsg`,
    SELF_SEND_MSG: "nodeIKernelMsgListener/onAddSendMsg",
    USER_INFO: "nodeIKernelProfileListener/onProfileSimpleChanged",
    USER_DETAIL_INFO: "nodeIKernelProfileListener/onProfileDetailInfoChanged",
    GROUPS: "nodeIKernelGroupListener/onGroupListUpdate",
    GROUPS_UNIX: "onGroupListUpdate",
    FRIENDS: "onBuddyListChange",
    MEDIA_DOWNLOAD_COMPLETE: "nodeIKernelMsgListener/onRichMediaDownloadComplete",
    UNREAD_GROUP_NOTIFY: "nodeIKernelGroupListener/onGroupNotifiesUnreadCountUpdated",
    GROUP_NOTIFY: "nodeIKernelGroupListener/onGroupSingleScreenNotifies",
    FRIEND_REQUEST: "nodeIKernelBuddyListener/onBuddyReqChange",
    SELF_STATUS: 'nodeIKernelProfileListener/onSelfStatusChanged',
    CACHE_SCAN_FINISH: "nodeIKernelStorageCleanListener/onFinishScan",
    MEDIA_UPLOAD_COMPLETE: "nodeIKernelMsgListener/onRichMediaUploadComplete",
}

export type ReceiveCmd = typeof ReceiveCmdS[keyof typeof ReceiveCmdS]

interface NTQQApiReturnData<PayloadType = unknown> extends Array<any> {
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
    method: ReceiveCmd[],
    hookFunc: ((payload: any) => void | Promise<void>)
    id: string
}> = []

export function hookNTQQApiReceive(window: BrowserWindow) {
    const originalSend = window.webContents.send;
    const patchSend = (channel: string, ...args: NTQQApiReturnData) => {
        try {
            if (!args[0]?.eventName?.startsWith("ns-LoggerApi")) {
                HOOK_LOG && log(`received ntqq api message: ${channel}`, JSON.stringify(args))
            }
        } catch (e) {

        }
        if (args?.[1] instanceof Array) {
            for (let receiveData of args?.[1]) {
                const ntQQApiMethodName = receiveData.cmdName;
                // log(`received ntqq api message: ${channel} ${ntQQApiMethodName}`, JSON.stringify(receiveData))
                for (let hook of receiveHooks) {
                    if (hook.method.includes(ntQQApiMethodName)) {
                        new Promise((resolve, reject) => {
                            try {
                                let _ = hook.hookFunc(receiveData.payload)
                                if (hook.hookFunc.constructor.name === "AsyncFunction") {
                                    (_ as Promise<void>).then()
                                }
                            } catch (e) {
                                log("hook error", e, receiveData.payload)
                            }
                        }).then()
                    }
                }
            }
        }
        if (args[0]?.callbackId) {
            // log("hookApiCallback", hookApiCallbacks, args)
            const callbackId = args[0].callbackId;
            if (hookApiCallbacks[callbackId]) {
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

export function hookNTQQApiCall(window: BrowserWindow) {
    // 监听调用NTQQApi
    let webContents = window.webContents as any;
    const ipc_message_proxy = webContents._events["-ipc-message"]?.[0] || webContents._events["-ipc-message"];

    const proxyIpcMsg = new Proxy(ipc_message_proxy, {
        apply(target, thisArg, args) {
            try {
                if (args[3][1][0] !== "info") {
                    HOOK_LOG && log("call NTQQ api", thisArg, args);
                }
            } catch (e) {

            }
            return target.apply(thisArg, args);
        },
    });
    if (webContents._events["-ipc-message"]?.[0]) {
        webContents._events["-ipc-message"][0] = proxyIpcMsg;
    } else {
        webContents._events["-ipc-message"] = proxyIpcMsg;
    }
}

export function registerReceiveHook<PayloadType>(method: ReceiveCmd | ReceiveCmd[], hookFunc: (payload: PayloadType) => void): string {
    const id = uuidv4()
    if (!Array.isArray(method)) {
        method = [method]
    }
    receiveHooks.push({
        method,
        hookFunc,
        id
    })
    return id;
}

export function removeReceiveHook(id: string) {
    const index = receiveHooks.findIndex(h => h.id === id)
    receiveHooks.splice(index, 1);
}

async function updateGroups(_groups: Group[], needUpdate: boolean = true) {
    for (let group of _groups) {
        let existGroup = groups.find(g => g.groupCode == group.groupCode);
        if (existGroup) {
            Object.assign(existGroup, group);
        } else {
            groups.push(group);
            existGroup = group;
        }

        if (needUpdate) {
            const members = await NTQQGroupApi.getGroupMembers(group.groupCode);

            if (members) {
                existGroup.members = members;
            }
        }
    }
}

async function processGroupEvent(payload) {
    try {
        const newGroupList = payload.groupList;
        for (const group of newGroupList) {
            let existGroup = groups.find(g => g.groupCode == group.groupCode);
            if (existGroup) {
                if (existGroup.memberCount > group.memberCount) {
                    const oldMembers = existGroup.members;

                    await sleep(200);  // 如果请求QQ API的速度过快，通常无法正确拉取到最新的群信息，因此这里人为引入一个延时
                    const newMembers = await NTQQGroupApi.getGroupMembers(group.groupCode);

                    group.members = newMembers;
                    const newMembersSet = new Set<string>();  // 建立索引降低时间复杂度

                    for (const member of newMembers) {
                        newMembersSet.add(member.uin);
                    }

                    for (const member of oldMembers) {
                        if (!newMembersSet.has(member.uin)) {
                            postOB11Event(new OB11GroupDecreaseEvent(group.groupCode, parseInt(member.uin)));
                            break;
                        }
                    }
                }
            }
        }

        updateGroups(newGroupList, false).then();
    } catch (e) {
        updateGroups(payload.groupList).then();
        console.log(e);
    }
}

// 群列表变动
registerReceiveHook<{ groupList: Group[], updateType: number }>(ReceiveCmdS.GROUPS, (payload) => {
    if (payload.updateType != 2) {
        updateGroups(payload.groupList).then();
    } else {
        if (process.platform == "win32") {
            processGroupEvent(payload).then();
        }
    }
})
registerReceiveHook<{ groupList: Group[], updateType: number }>(ReceiveCmdS.GROUPS_UNIX, (payload) => {
    if (payload.updateType != 2) {
        updateGroups(payload.groupList).then();
    } else {
        if (process.platform != "win32") {
            processGroupEvent(payload).then();
        }
    }
})

// 好友列表变动
registerReceiveHook<{
    data: { categoryId: number, categroyName: string, categroyMbCount: number, buddyList: User[] }[]
}>(ReceiveCmdS.FRIENDS, payload => {
    for (const fData of payload.data) {
        const _friends = fData.buddyList;
        for (let friend of _friends) {
            let existFriend = friends.find(f => f.uin == friend.uin)
            if (!existFriend) {
                friends.push(friend)
            } else {
                Object.assign(existFriend, friend)
            }
        }
    }
})

// 新消息
registerReceiveHook<{ msgList: Array<RawMessage> }>([ReceiveCmdS.NEW_MSG, ReceiveCmdS.NEW_ACTIVE_MSG], (payload) => {
    const {autoDeleteFile} = getConfigUtil().getConfig();
    if (!autoDeleteFile) {
        return
    }
    for (const message of payload.msgList) {
        // log("收到新消息，push到历史记录", message.msgId)
        // dbUtil.addMsg(message).then()
        // 清理文件

        for (const msgElement of message.elements) {
            setTimeout(() => {
                const picPath = msgElement.picElement?.sourcePath
                const picThumbPath = [...msgElement.picElement?.thumbPath.values()]
                const pttPath = msgElement.pttElement?.filePath
                const filePath = msgElement.fileElement?.filePath
                const videoPath = msgElement.videoElement?.filePath
                const videoThumbPath: string[] = [...msgElement.videoElement?.thumbPath.values()]
                const pathList = [picPath, ...picThumbPath, pttPath, filePath, videoPath, ...videoThumbPath]
                if (msgElement.picElement) {
                    pathList.push(...Object.values(msgElement.picElement.thumbPath))
                }
                const aioOpGrayTipElement = msgElement.grayTipElement?.aioOpGrayTipElement
                if (aioOpGrayTipElement) {
                    tempGroupCodeMap[aioOpGrayTipElement.peerUid] = aioOpGrayTipElement.fromGrpCodeOfTmpChat;
                }

                // log("需要清理的文件", pathList);
                for (const path of pathList) {
                    if (path) {
                        fs.unlink(picPath, () => {
                            log("删除文件成功", path)
                        });
                    }
                }
            }, getConfigUtil().getConfig().autoDeleteFileSecond * 1000)
        }
    }
})

registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmdS.SELF_SEND_MSG, ({msgRecord}) => {
    const message = msgRecord;
    const peerUid = message.peerUid;
    // log("收到自己发送成功的消息", Object.keys(sendMessagePool), message);
    // log("收到自己发送成功的消息", message.msgId, message.msgSeq);
    dbUtil.addMsg(message).then()
    const sendCallback = sendMessagePool[peerUid]
    if (sendCallback) {
        try {
            sendCallback(message);
        } catch (e) {
            log("receive self msg error", e.stack)
        }
    }
})

registerReceiveHook<{ info: { status: number } }>(ReceiveCmdS.SELF_STATUS, (info) => {
    selfInfo.online = info.info.status !== 20
})
