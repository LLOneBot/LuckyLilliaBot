import {type BrowserWindow} from 'electron'
import {getConfigUtil, log, sleep} from '../common/utils'
import {NTQQApi, type NTQQApiClass, sendMessagePool} from './ntcall'
import {type Group, type RawMessage, type User} from './types'
import {friends, groups, selfInfo, tempGroupCodeMap} from '../common/data'
import {OB11GroupDecreaseEvent} from '../onebot11/event/notice/OB11GroupDecreaseEvent'
import {OB11GroupIncreaseEvent} from '../onebot11/event/notice/OB11GroupIncreaseEvent'
import {v4 as uuidv4} from 'uuid'
import {postOB11Event} from '../onebot11/server/postOB11Event'
import {HOOK_LOG} from '../common/config'
import fs from 'fs'
import {dbUtil} from "../common/db";

export const hookApiCallbacks: Record<string, (apiReturn: any) => void> = {}

export enum ReceiveCmd {
    UPDATE_MSG = 'nodeIKernelMsgListener/onMsgInfoListUpdate',
    NEW_MSG = 'nodeIKernelMsgListener/onRecvMsg',
    SELF_SEND_MSG = 'nodeIKernelMsgListener/onAddSendMsg',
    USER_INFO = 'nodeIKernelProfileListener/onProfileSimpleChanged',
    USER_DETAIL_INFO = 'nodeIKernelProfileListener/onProfileDetailInfoChanged',
    GROUPS = 'nodeIKernelGroupListener/onGroupListUpdate',
    GROUPS_UNIX = 'onGroupListUpdate',
    FRIENDS = 'onBuddyListChange',
    MEDIA_DOWNLOAD_COMPLETE = 'nodeIKernelMsgListener/onRichMediaDownloadComplete',
    UNREAD_GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupNotifiesUnreadCountUpdated',
    GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupSingleScreenNotifies',
    FRIEND_REQUEST = 'nodeIKernelBuddyListener/onBuddyReqChange',
    SELF_STATUS = 'nodeIKernelProfileListener/onSelfStatusChanged',
}

interface NTQQApiReturnData<PayloadType = unknown> extends Array<any> {
    0: {
        'type': 'request'
        'eventName': NTQQApiClass
        'callbackId'?: string
    }
    1:
        Array<{
            cmdName: ReceiveCmd
            cmdType: 'event'
            payload: PayloadType
        }>
}

const receiveHooks: Array<{
    method: ReceiveCmd
    hookFunc: ((payload: any) => void | Promise<void>)
    id: string
}> = []

export function hookNTQQApiReceive(window: BrowserWindow) {
    const originalSend = window.webContents.send
    const patchSend = (channel: string, ...args: NTQQApiReturnData) => {
        HOOK_LOG && log(`received ntqq api message: ${channel}`, JSON.stringify(args))
        if (args?.[1] instanceof Array) {
            for (const receiveData of args?.[1]) {
                const ntQQApiMethodName = receiveData.cmdName
                // log(`received ntqq api message: ${channel} ${ntQQApiMethodName}`, JSON.stringify(receiveData))
                for (const hook of receiveHooks) {
                    if (hook.method === ntQQApiMethodName) {
                        new Promise((resolve, reject) => {
                            try {
                                const _ = hook.hookFunc(receiveData.payload)
                                if (hook.hookFunc.constructor.name === 'AsyncFunction') {
                                    (_ as Promise<void>).then()
                                }
                            } catch (e) {
                                log('hook error', e, receiveData.payload)
                            }
                        }).then()
                    }
                }
            }
        }
        if (args[0]?.callbackId) {
            // log("hookApiCallback", hookApiCallbacks, args)
            const callbackId = args[0].callbackId
            if (hookApiCallbacks[callbackId]) {
                // log("callback found")
                new Promise((resolve, reject) => {
                    hookApiCallbacks[callbackId](args[1])
                }).then()
                delete hookApiCallbacks[callbackId]
            }
        }
        return originalSend.call(window.webContents, channel, ...args)
    }
    window.webContents.send = patchSend
}

export function hookNTQQApiCall(window: BrowserWindow) {
    // 监听调用NTQQApi
    const webContents = window.webContents as any
    const ipc_message_proxy = webContents._events['-ipc-message']?.[0] || webContents._events['-ipc-message']

    const proxyIpcMsg = new Proxy(ipc_message_proxy, {
        apply(target, thisArg, args) {
            HOOK_LOG && log('call NTQQ api', thisArg, args)
            return target.apply(thisArg, args)
        }
    })
    if (webContents._events['-ipc-message']?.[0]) {
        webContents._events['-ipc-message'][0] = proxyIpcMsg
    } else {
        webContents._events['-ipc-message'] = proxyIpcMsg
    }
}

export function registerReceiveHook<PayloadType>(method: ReceiveCmd, hookFunc: (payload: PayloadType) => void): string {
    const id = uuidv4()
    receiveHooks.push({
        method,
        hookFunc,
        id
    })
    return id
}

export function removeReceiveHook(id: string) {
    const index = receiveHooks.findIndex(h => h.id === id)
    receiveHooks.splice(index, 1)
}

async function updateGroups(_groups: Group[], needUpdate: boolean = true) {
    for (const group of _groups) {
        let existGroup = groups.find(g => g.groupCode == group.groupCode)
        if (existGroup) {
            Object.assign(existGroup, group)
        } else {
            groups.push(group)
            existGroup = group
        }

        if (needUpdate) {
            const members = await NTQQApi.getGroupMembers(group.groupCode)

            if (members) {
                existGroup.members = members
            }
        }
    }
}

async function processGroupEvent(payload) {
    try {
        const newGroupList = payload.groupList
        for (const group of newGroupList) {
            const existGroup = groups.find(g => g.groupCode == group.groupCode)
            if (existGroup) {
                if (existGroup.memberCount > group.memberCount) {
                    const oldMembers = existGroup.members

                    await sleep(200) // 如果请求QQ API的速度过快，通常无法正确拉取到最新的群信息，因此这里人为引入一个延时
                    const newMembers = await NTQQApi.getGroupMembers(group.groupCode)

                    group.members = newMembers
                    const newMembersSet = new Set<string>() // 建立索引降低时间复杂度

                    for (const member of newMembers) {
                        newMembersSet.add(member.uin)
                    }

                    for (const member of oldMembers) {
                        if (!newMembersSet.has(member.uin)) {
                            postOB11Event(new OB11GroupDecreaseEvent(group.groupCode, parseInt(member.uin)))
                            break
                        }
                    }
                } else if (existGroup.memberCount < group.memberCount) {
                    const oldMembers = existGroup.members
                    const oldMembersSet = new Set<string>()
                    for (const member of oldMembers) {
                        oldMembersSet.add(member.uin)
                    }

                    await sleep(200)
                    const newMembers = await NTQQApi.getGroupMembers(group.groupCode)

                    group.members = newMembers
                    for (const member of newMembers) {
                        if (!oldMembersSet.has(member.uin)) {
                            postOB11Event(new OB11GroupIncreaseEvent(group.groupCode, parseInt(member.uin)))
                            break
                        }
                    }
                }
            }
        }

        updateGroups(newGroupList, false).then()
    } catch (e) {
        updateGroups(payload.groupList).then()
        console.log(e)
    }
}

registerReceiveHook<{ groupList: Group[], updateType: number }>(ReceiveCmd.GROUPS, (payload) => {
    if (payload.updateType != 2) {
        updateGroups(payload.groupList).then()
    } else {
        if (process.platform == 'win32') {
            processGroupEvent(payload).then()
        }
    }
})
registerReceiveHook<{ groupList: Group[], updateType: number }>(ReceiveCmd.GROUPS_UNIX, (payload) => {
    if (payload.updateType != 2) {
        updateGroups(payload.groupList).then()
    } else {
        if (process.platform != 'win32') {
            processGroupEvent(payload).then()
        }
    }
})

registerReceiveHook<{
    data: Array<{ categoryId: number, categroyName: string, categroyMbCount: number, buddyList: User[] }>
}>(ReceiveCmd.FRIENDS, payload => {
    for (const fData of payload.data) {
        const _friends = fData.buddyList
        for (const friend of _friends) {
            const existFriend = friends.find(f => f.uin == friend.uin)
            if (!existFriend) {
                friends.push(friend)
            } else {
                Object.assign(existFriend, friend)
            }
        }
    }
})

registerReceiveHook<{ msgList: RawMessage[] }>(ReceiveCmd.NEW_MSG, (payload) => {
    const {autoDeleteFile, autoDeleteFileSecond} = getConfigUtil().getConfig()
    for (const message of payload.msgList) {
        // log("收到新消息，push到历史记录", message.msgSeq)
        dbUtil.addMsg(message).then()
        // 清理文件
        if (!autoDeleteFile) {
            continue
        }
        for (const msgElement of message.elements) {
            setTimeout(() => {
                const picPath = msgElement.picElement?.sourcePath
                const pttPath = msgElement.pttElement?.filePath
                const pathList = [picPath, pttPath]
                if (msgElement.picElement) {
                    pathList.push(...Object.values(msgElement.picElement.thumbPath))
                }
                const aioOpGrayTipElement = msgElement.grayTipElement?.aioOpGrayTipElement
                if (aioOpGrayTipElement){
                    tempGroupCodeMap[aioOpGrayTipElement.peerUid] = aioOpGrayTipElement.fromGrpCodeOfTmpChat;
                }
                // log("需要清理的文件", pathList);
                for (const path of pathList) {
                    if (path) {
                        fs.unlink(picPath, () => {
                            log('删除文件成功', path)
                        })
                    }
                }
            }, autoDeleteFileSecond * 1000)
        }
    }
})

registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmd.SELF_SEND_MSG, ({msgRecord}) => {
    const message = msgRecord
    const peerUid = message.peerUid
    // log("收到自己发送成功的消息", Object.keys(sendMessagePool), message);
    // log("收到自己发送成功的消息", message.msgSeq);
    dbUtil.addMsg(message).then()
    const sendCallback = sendMessagePool[peerUid]
    if (sendCallback) {
        try {
            sendCallback(message)
        } catch (e) {
            log('receive self msg error', e.stack)
        }
    }
})

registerReceiveHook<{ info: { status: number } }>(ReceiveCmd.SELF_STATUS, (info) => {
    selfInfo.online = info.info.status !== 20
})
