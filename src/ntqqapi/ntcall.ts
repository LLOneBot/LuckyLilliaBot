import {ipcMain} from "electron";
import {hookApiCallbacks, ReceiveCmd, registerReceiveHook, removeReceiveHook} from "./hook";
import {log} from "../common/utils";
import {
    ChatType,
    Friend,
    Group,
    GroupMember,
    GroupNotify,
    RawMessage,
    SelfInfo,
    SendMessageElement,
    User
} from "./types";
import * as fs from "fs";
import {addHistoryMsg, msgHistory, selfInfo} from "../common/data";
import {v4 as uuidv4} from "uuid"

interface IPCReceiveEvent {
    eventName: string
    callbackId: string
}

export type IPCReceiveDetail = [
    {
        cmdName: NTQQApiMethod
        payload: unknown
    },
]

export enum NTQQApiClass {
    NT_API = "ns-ntApi",
    FS_API = "ns-FsApi",
    GLOBAL_DATA = "ns-GlobalDataApi"
}

export enum NTQQApiMethod {
    LIKE_FRIEND = "nodeIKernelProfileLikeService/setBuddyProfileLike",
    SELF_INFO = "fetchAuthData",
    FRIENDS = "nodeIKernelBuddyService/getBuddyList",
    GROUPS = "nodeIKernelGroupService/getGroupList",
    GROUP_MEMBER_SCENE = "nodeIKernelGroupService/createMemberListScene",
    GROUP_MEMBERS = "nodeIKernelGroupService/getNextMemberList",
    USER_INFO = "nodeIKernelProfileService/getUserSimpleInfo",
    FILE_TYPE = "getFileType",
    FILE_MD5 = "getFileMd5",
    FILE_COPY = "copyFile",
    IMAGE_SIZE = "getImageSizeFromPath",
    FILE_SIZE = "getFileSize",
    MEDIA_FILE_PATH = "nodeIKernelMsgService/getRichMediaFilePathForGuild",
    RECALL_MSG = "nodeIKernelMsgService/recallMsg",
    SEND_MSG = "nodeIKernelMsgService/sendMsg",
    DOWNLOAD_MEDIA = "nodeIKernelMsgService/downloadRichMedia",
    MULTI_FORWARD_MSG = "nodeIKernelMsgService/multiForwardMsgWithComment", // 合并转发
    GET_GROUP_NOTICE = "nodeIKernelGroupService/getSingleScreenNotifies",
}

enum NTQQApiChannel {
    IPC_UP_2 = "IPC_UP_2",
    IPC_UP_3 = "IPC_UP_3",
    IPC_UP_1 = "IPC_UP_1",
}

export interface Peer {
    chatType: ChatType
    peerUid: string  // 如果是群聊uid为群号，私聊uid就是加密的字符串
    guildId?: ""
}

enum CallBackType {
    UUID,
    METHOD
}

interface NTQQApiParams {
    methodName: NTQQApiMethod | string,
    className?: NTQQApiClass,
    channel?: NTQQApiChannel,
    classNameIsRegister?: boolean
    args?: unknown[],
    cbCmd?: ReceiveCmd | null,
    cmdCB?: (payload: any) => boolean;
    timeoutSecond?: number,
}

function callNTQQApi<ReturnType>(params: NTQQApiParams) {
    let {
        className, methodName, channel, args,
        cbCmd, timeoutSecond: timeout,
        classNameIsRegister, cmdCB
    } = params;
    className = className ?? NTQQApiClass.NT_API;
    channel = channel ?? NTQQApiChannel.IPC_UP_2;
    args = args ?? [];
    timeout = timeout ?? 5;
    const uuid = uuidv4();
    // log("callNTQQApi", channel, className, methodName, args, uuid)
    return new Promise((resolve: (data: ReturnType) => void, reject) => {
        // log("callNTQQApiPromise", channel, className, methodName, args, uuid)
        const _timeout = timeout * 1000
        let success = false
        let eventName = className + "-" + channel[channel.length - 1];
        if (classNameIsRegister) {
            eventName += "-register";
        }
        const apiArgs = [methodName, ...args]
        if (!cbCmd) {
            // QQ后端会返回结果，并且可以插根据uuid识别
            hookApiCallbacks[uuid] = (r: ReturnType) => {
                success = true
                resolve(r)
            };
        } else {
            // 这里的callback比较特殊，QQ后端先返回是否调用成功，再返回一条结果数据
            hookApiCallbacks[uuid] = (result: GeneralCallResult) => {
                log(`${methodName} callback`, result)
                if (result?.result == 0 || result === undefined) {
                    const hookId = registerReceiveHook<ReturnType>(cbCmd, (payload) => {
                        log(methodName, "second callback", cbCmd, payload);
                        if (cmdCB) {
                            if (cmdCB(payload)) {
                                removeReceiveHook(hookId);
                                success = true
                                resolve(payload);
                            }
                        } else {
                            removeReceiveHook(hookId);
                            success = true
                            resolve(payload);
                        }
                    })
                } else {
                    success = true
                    reject(`ntqq api call failed, ${result.errMsg}`);
                }
            }
        }
        setTimeout(() => {
            // log("ntqq api timeout", success, channel, className, methodName)
            if (!success) {
                log(`ntqq api timeout ${channel}, ${eventName}, ${methodName}`, apiArgs);
                reject(`ntqq api timeout ${channel}, ${eventName}, ${methodName}, ${apiArgs}`)
            }
        }, _timeout)

        ipcMain.emit(
            channel,
            {},
            {type: 'request', callbackId: uuid, eventName},
            apiArgs
        )
    })
}


export let sendMessagePool: Record<string, ((sendSuccessMsg: RawMessage) => void) | null> = {}// peerUid: callbackFunnc

interface GeneralCallResult {
    result: number,  // 0: success
    errMsg: string
}


export class NTQQApi {
    // static likeFriend = defineNTQQApi<void>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.LIKE_FRIEND)
    static likeFriend(uid: string, count = 1) {
        return callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.LIKE_FRIEND,
            args: [{
                doLikeUserInfo: {
                    friendUid: uid,
                    sourceId: 71,
                    doLikeCount: count,
                    doLikeTollCount: 0
                }
            }, null]
        })
    }

    static getSelfInfo() {
        return callNTQQApi<SelfInfo>({
            className: NTQQApiClass.GLOBAL_DATA,
            methodName: NTQQApiMethod.SELF_INFO, timeoutSecond: 2
        })
    }

    static async getUserInfo(uid: string) {
        const result = await callNTQQApi<{ profiles: Map<string, User> }>({
            methodName: NTQQApiMethod.USER_INFO,
            args: [{force: true, uids: [uid]}, undefined],
            cbCmd: ReceiveCmd.USER_INFO
        })
        return result.profiles.get(uid)
    }

    static async getFriends(forced = false) {
        const data = await callNTQQApi<{
            data: {
                categoryId: number,
                categroyName: string,
                categroyMbCount: number,
                buddyList: Friend[]
            }[]
        }>(
            {
                methodName: NTQQApiMethod.FRIENDS,
                args: [{force_update: forced}, undefined],
                cbCmd: ReceiveCmd.FRIENDS
            })
        let _friends: Friend[] = [];
        for (const fData of data.data) {
            _friends.push(...fData.buddyList)
        }
        return _friends
    }

    static async getGroups(forced = false) {
        let cbCmd = ReceiveCmd.GROUPS
        if (process.platform != "win32") {
            cbCmd = ReceiveCmd.GROUPS_UNIX
        }
        const result = await callNTQQApi<{
            updateType: number,
            groupList: Group[]
        }>({methodName: NTQQApiMethod.GROUPS, args: [{force_update: forced}, undefined], cbCmd})
        return result.groupList
    }

    static async getGroupMembers(groupQQ: string, num = 3000) {
        const sceneId = await callNTQQApi({
            methodName: NTQQApiMethod.GROUP_MEMBER_SCENE,
            args: [{
                groupCode: groupQQ,
                scene: "groupMemberList_MainWindow"
            }]
        })
        // log("get group member sceneId", sceneId);
        try {
            const result = await callNTQQApi<{
                result: { infos: any }
            }>({
                methodName: NTQQApiMethod.GROUP_MEMBERS,
                args: [{
                    sceneId: sceneId,
                    num: num
                },
                    null
                ]
            })
            // log("members info", typeof result.result.infos, Object.keys(result.result.infos))
            let values = result.result.infos.values()

            let members = Array.from(values) as GroupMember[]
            for (const member of members) {
                // uidMaps[member.uid] = member.uin;
            }
            // log(uidMaps);
            // log("members info", values);
            log(`get group ${groupQQ} members success`)
            return members
        } catch (e) {
            log(`get group ${groupQQ} members failed`, e)
            return []
        }
    }


    static getFileType(filePath: string) {
        return callNTQQApi<{ ext: string }>({
            className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.FILE_TYPE, args: [filePath]
        })
    }

    static getFileMd5(filePath: string) {
        return callNTQQApi<string>({
            className: NTQQApiClass.FS_API,
            methodName: NTQQApiMethod.FILE_MD5,
            args: [filePath]
        })
    }

    static copyFile(filePath: string, destPath: string) {
        return callNTQQApi<string>({
            className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.FILE_COPY, args: [{
                fromPath: filePath,
                toPath: destPath
            }]
        })
    }

    static getImageSize(filePath: string) {
        return callNTQQApi<{ width: number, height: number }>({
            className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.IMAGE_SIZE, args: [filePath]
        })
    }

    static getFileSize(filePath: string) {
        return callNTQQApi<number>({
            className: NTQQApiClass.FS_API, methodName: NTQQApiMethod.FILE_SIZE, args: [filePath]
        })
    }

    // 上传文件到QQ的文件夹
    static async uploadFile(filePath: string) {
        const md5 = await NTQQApi.getFileMd5(filePath);
        let ext = (await NTQQApi.getFileType(filePath))?.ext
        if (ext) {
            ext = "." + ext
        } else {
            ext = ""
        }
        const fileName = `${md5}${ext}`;
        const mediaPath = await callNTQQApi<string>({
            methodName: NTQQApiMethod.MEDIA_FILE_PATH,
            args: [{
                path_info: {
                    md5HexStr: md5,
                    fileName: fileName,
                    elementType: 2,
                    elementSubType: 0,
                    thumbSize: 0,
                    needCreate: true,
                    downloadType: 1,
                    file_uuid: ""
                }
            }]
        })
        log("media path", mediaPath)
        await NTQQApi.copyFile(filePath, mediaPath);
        const fileSize = await NTQQApi.getFileSize(filePath);
        return {
            md5,
            fileName,
            path: mediaPath,
            fileSize
        }
    }

    static async downloadMedia(msgId: string, chatType: ChatType, peerUid: string, elementId: string, thumbPath: string, sourcePath: string) {
        // 用于下载收到的消息中的图片等
        if (fs.existsSync(sourcePath)) {
            return sourcePath
        }
        const apiParams = [
            {
                getReq: {
                    msgId: msgId,
                    chatType: chatType,
                    peerUid: peerUid,
                    elementId: elementId,
                    thumbSize: 0,
                    downloadType: 1,
                    filePath: thumbPath,
                },
            },
            undefined,
        ]
        // log("需要下载media", sourcePath);
        await callNTQQApi({
            methodName: NTQQApiMethod.DOWNLOAD_MEDIA,
            args: apiParams,
            cbCmd: ReceiveCmd.MEDIA_DOWNLOAD_COMPLETE,
            cmdCB: (payload: { notifyInfo: { filePath: string } }) => {
                // log("media 下载完成判断", payload.notifyInfo.filePath, sourcePath);
                return payload.notifyInfo.filePath == sourcePath;
            }
        })
        return sourcePath
    }

    static recallMsg(peer: Peer, msgIds: string[]) {
        return callNTQQApi({
            methodName: NTQQApiMethod.RECALL_MSG, args: [{
                peer,
                msgIds
            }, null]
        })
    }

    static sendMsg(peer: Peer, msgElements: SendMessageElement[], waitComplete = false, timeout = 10000) {
        const sendTimeout = timeout

        return new Promise<RawMessage>((resolve, reject) => {
            const peerUid = peer.peerUid;
            let usingTime = 0;
            let success = false;
            let isTimeout = false;

            const checkSuccess = () => {
                if (!success) {
                    sendMessagePool[peerUid] = null;
                    isTimeout = true;
                    reject("发送超时")
                }
            }
            setTimeout(checkSuccess, sendTimeout);

            const checkLastSend = () => {
                let lastSending = sendMessagePool[peerUid]
                if (sendTimeout < usingTime) {
                    sendMessagePool[peerUid] = null;
                    isTimeout = true;
                    reject("发送超时")
                }
                if (!!lastSending) {
                    // log("有正在发送的消息，等待中...")
                    usingTime += 500;
                    setTimeout(checkLastSend, 500);
                } else {
                    log("可以进行发送消息，设置发送成功回调", sendMessagePool)
                    sendMessagePool[peerUid] = (rawMessage: RawMessage) => {
                        sendMessagePool[peerUid] = null;
                        const checkSendComplete = () => {
                            if (isTimeout) {
                                return reject("发送超时")
                            }
                            if (msgHistory[rawMessage.msgId]?.sendStatus == 2) {
                                log(`给${peerUid}发送消息成功`)
                                success = true;
                                resolve(rawMessage);
                            } else {
                                setTimeout(checkSendComplete, 500)
                            }
                        }
                        if (waitComplete) {
                            checkSendComplete();
                        } else {
                            success = true;
                            log(`给${peerUid}发送消息成功`)
                            resolve(rawMessage);
                        }
                    }
                }
            }
            checkLastSend()
            callNTQQApi({
                methodName: NTQQApiMethod.SEND_MSG,
                args: [{
                    msgId: "0",
                    peer, msgElements,
                    msgAttributeInfos: new Map(),
                }, null]
            }).then()
        })
    }

    static multiForwardMsg(srcPeer: Peer, destPeer: Peer, msgIds: string[]) {
        let msgInfos = msgIds.map(id => {
            return {msgId: id, senderShowName: "LLOneBot"}
        })
        const apiArgs = [
            {
                msgInfos,
                srcContact: srcPeer,
                dstContact: destPeer,
                commentElements: [],
                msgAttributeInfos: new Map()
            },
            null,
        ]
        return new Promise<RawMessage>((resolve, reject) => {
            let complete = false
            setTimeout(() => {
                if (!complete) {
                    reject("转发消息超时");
                }
            }, 5000)
            registerReceiveHook(ReceiveCmd.SELF_SEND_MSG, (payload: { msgRecord: RawMessage }) => {
                const msg = payload.msgRecord;
                // 需要判断它是转发的消息，并且识别到是当前转发的这一条
                const arkElement = msg.elements.find(ele => ele.arkElement)
                if (!arkElement) {
                    // log("收到的不是转发消息")
                    return
                }
                const forwardData: any = JSON.parse(arkElement.arkElement.bytesData);
                if (forwardData.app != "com.tencent.multimsg") {
                    return
                }
                if (msg.peerUid == destPeer.peerUid && msg.senderUid == selfInfo.uid) {
                    complete = true;
                    addHistoryMsg(msg)
                    resolve(msg);
                    log("转发消息成功：", payload)
                }
            })
            callNTQQApi<GeneralCallResult>({
                methodName: NTQQApiMethod.MULTI_FORWARD_MSG,
                args: apiArgs
            }).then(result => {
                log("转发消息结果:", result, apiArgs)
                if (result.result !== 0) {
                    complete = true;
                    reject("转发消息失败," + JSON.stringify(result));
                }
            })
        })
    }

    static async getGroupNotifies() {
        // 获取管理员变更
        // 加群通知，退出通知，需要管理员权限
        await callNTQQApi<GeneralCallResult>({
            methodName: ReceiveCmd.GROUP_NOTIFY,
            classNameIsRegister: true,
        })
        return await callNTQQApi<GroupNotify>({
            methodName: NTQQApiMethod.GET_GROUP_NOTICE,
            cbCmd: ReceiveCmd.GROUP_NOTIFY,
            args:[
                {"doubt":false,"startSeq":"","number":14},
                null
            ]
        });
    }
}