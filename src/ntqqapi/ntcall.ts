import {ipcMain} from "electron";
import {v4 as uuidv4} from "uuid";

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
    NT_FS_API = "ns-FsApi",
}

export enum NTQQApiMethod {
    LIKE_FRIEND = "nodeIKernelProfileLikeService/setBuddyProfileLike",
    UPDATE_MSG = "nodeIKernelMsgListener/onMsgInfoListUpdate"
}

enum NTQQApiChannel {
    IPC_UP_2 = "IPC_UP_2",
    IPC_UP_3 = "IPC_UP_3",
    IPC_UP_1 = "IPC_UP_1",
}


function callNTQQApi(channel: NTQQApiChannel, className: NTQQApiClass, methodName: NTQQApiMethod, args: unknown[]=[]) {
    const uuid = uuidv4();
    return new Promise((resolve, reject)  => {
        ipcMain.emit(
            channel,
            {
                sender: {
                    send: (args: [string, IPCReceiveEvent, IPCReceiveDetail]) => {
                        resolve(args)
                    },
                },
            },
            {type: 'request', callbackId: uuid, eventName: className + "-" + channel[channel.length - 1]},
            [methodName, ...args],
        )
    })
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
}