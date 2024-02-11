import { ipcMain } from "electron";
import { v4 as uuidv4 } from "uuid";
import { ReceiveCmd, hookApiCallbacks, registerReceiveHook, removeReceiveHook } from "./hook";
import { log } from "../common/utils";
import { ChatType, Friend, SelfInfo, User } from "./types";
import { Group } from "./types";
import { GroupMember } from "./types";
import { RawMessage } from "./types";
import { SendMessageElement } from "./types";

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
    UPDATE_MSG = "nodeIKernelMsgListener/onMsgInfoListUpdate",
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


function callNTQQApi<ReturnType>(channel: NTQQApiChannel, className: NTQQApiClass, methodName: NTQQApiMethod, args: unknown[] = [], cbCmd: ReceiveCmd | null = null, timeout = 5) {
    const uuid = uuidv4();
    // log("callNTQQApi", channel, className, methodName, args, uuid)
    return new Promise((resolve: (data: ReturnType) => void, reject) => {
        // log("callNTQQApiPromise", channel, className, methodName, args, uuid)
        const _timeout = timeout * 1000
        let success = false
        if (!cbCmd) {
            // QQ后端会返回结果，并且可以插根据uuid识别
            hookApiCallbacks[uuid] = (r: ReturnType) => {
                success = true
                resolve(r)
            };
        }
        else {
            // 这里的callback比较特殊，QQ后端先返回是否调用成功，再返回一条结果数据
            hookApiCallbacks[uuid] = (result: GeneralCallResult) => {
                log(`${methodName} callback`, result)
                if (result.result == 0) {
                    const hookId = registerReceiveHook<ReturnType>(cbCmd, (payload) => {
                        log(methodName, "second callback", cbCmd, payload);
                        removeReceiveHook(hookId);
                        success = true
                        resolve(payload);
                    })
                }
                else {
                    success = true
                    reject(`ntqq api call failed, ${result.errMsg}`);
                }
            }
        }
        setTimeout(() => {
            // log("ntqq api timeout", success, channel, className, methodName)
            if (!success) {
                log(`ntqq api timeout ${channel}, ${className}, ${methodName}`)
                reject(`ntqq api timeout ${channel}, ${className}, ${methodName}`)
            }
        }, _timeout)

        ipcMain.emit(
            channel,
            {},
            { type: 'request', callbackId: uuid, eventName: className + "-" + channel[channel.length - 1] },
            [methodName, ...args],
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
        return callNTQQApi(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.LIKE_FRIEND, [{
            doLikeUserInfo: {
                friendUid: uid,
                sourceId: 71,
                doLikeCount: count,
                doLikeTollCount: 0
            }
        },
            null])
    }

    static getSelfInfo() {
        return callNTQQApi<SelfInfo>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.GLOBAL_DATA, NTQQApiMethod.SELF_INFO, [], null, 2)

    }

    static async getUserInfo(uid: string) {
        const result = await callNTQQApi<{ info: User }>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.USER_INFO,
            [{ force: true, uids: [uid] }, undefined], ReceiveCmd.USER_INFO)
        return result.info

    }

    // static async getFriends(forced = false) {
    //     const data = await callNTQQApi<{ data: { categoryId: number, categroyName: string, categroyMbCount: number, buddyList: Friend[] }[] }>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.FRIENDS, [{ force_update: forced }, undefined], ReceiveCmd.FRIENDS)
    //     let _friends: Friend[] = [];
    //     for (const fData of data.data) {
    //         _friends.push(...fData.buddyList)
    //     }
    //     return _friends
    // }

    // static async getGroups(forced = false) {
    //     let cbCmd = ReceiveCmd.GROUPS
    //     if (process.platform != "win32") {
    //         cbCmd = ReceiveCmd.GROUPS_UNIX
    //     }
    //     const result = await callNTQQApi<{ updateType: number, groupList: Group[] }>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.GROUPS, [{ force_update: forced }, undefined], cbCmd)
    //     return result.groupList
    // }

    static async getGroupMembers(groupQQ: string, num = 3000) {
        const sceneId = await callNTQQApi(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.GROUP_MEMBER_SCENE, [{
            groupCode: groupQQ,
            scene: "groupMemberList_MainWindow"
        }])
        // log("get group member sceneId", sceneId);
        try {
            const result = await callNTQQApi<{result:{infos: any}}>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.GROUP_MEMBERS,
                [{
                    sceneId: sceneId,
                    num: num
                },
                    null
                ])
            // log("members info", typeof result.result.infos, Object.keys(result.result.infos))
            let values = result.result.infos.values()

            values =  Array.from(values) as GroupMember[]
            // log("members info", values);
            return values
        } catch (e) {
            log(`get group ${groupQQ} members failed`, e)
            return []
        }
    }



    static getFileType(filePath: string) {
        return callNTQQApi<{
            ext: string
        }>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.FS_API, NTQQApiMethod.FILE_TYPE, [filePath])
    }

    static getFileMd5(filePath: string) {
        return callNTQQApi<string>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.FS_API, NTQQApiMethod.FILE_MD5, [filePath])
    }

    static copyFile(filePath: string, destPath: string) {
        return callNTQQApi<string>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.FS_API, NTQQApiMethod.FILE_COPY, [{ fromPath: filePath, toPath: destPath }])
    }

    static getImageSize(filePath: string) {
        return callNTQQApi<{
            width: number,
            height: number
        }>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.FS_API, NTQQApiMethod.IMAGE_SIZE, [filePath])
    }

    static getFileSize(filePath: string) {
        return callNTQQApi<number>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.FS_API, NTQQApiMethod.FILE_SIZE, [filePath])
    }

    // 上传文件到QQ的文件夹
    static async uploadFile(filePath: string) {
        const md5 = await NTQQApi.getFileMd5(filePath);
        const fileName = `${md5}.${(await NTQQApi.getFileType(filePath)).ext}`;
        const mediaPath = await callNTQQApi<string>(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.MEDIA_FILE_PATH, [{
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
        }])
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

    static recallMsg(peer: Peer, msgIds: string[]) {
        return callNTQQApi(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.RECALL_MSG, [{ peer, msgIds }, null])
    }

    static sendMsg(peer: Peer, msgElements: SendMessageElement[]) {
        const sendTimeout = 10 * 1000

        return new Promise<RawMessage>((resolve, reject) => {
            const peerUid = peer.peerUid;
            let usingTime = 0;
            let success = false;

            const checkSuccess = () => {
                if (!success) {
                    sendMessagePool[peerUid] = null;
                    reject("发送超时")
                }
            }
            setTimeout(checkSuccess, sendTimeout);

            const checkLastSend = () => {
                let lastSending = sendMessagePool[peerUid]
                if (sendTimeout < usingTime) {
                    sendMessagePool[peerUid] = null;
                    reject("发送超时")
                }
                if (!!lastSending) {
                    // log("有正在发送的消息，等待中...")
                    usingTime += 100;
                    setTimeout(checkLastSend, 100);
                }
                else {
                    log("可以进行发送消息，设置发送成功回调", sendMessagePool)
                    sendMessagePool[peerUid] = (rawMessage: RawMessage) => {
                        success = true;
                        sendMessagePool[peerUid] = null;
                        resolve(rawMessage);
                    }
                }
            }
            checkLastSend()
            callNTQQApi(NTQQApiChannel.IPC_UP_2, NTQQApiClass.NT_API, NTQQApiMethod.SEND_MSG, [{
                msgId: "0",
                peer, msgElements,
                msgAttributeInfos: new Map(),
            }, null]).then()
        })

    }
}