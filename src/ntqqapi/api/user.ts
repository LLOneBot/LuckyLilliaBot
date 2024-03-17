import {callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod} from "../ntcall";
import {SelfInfo, User} from "../types";
import {ReceiveCmdS} from "../hook";
import {uidMaps} from "../../common/data";


export class NTQQUserApi{
    static async setQQAvatar(filePath: string) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.SET_QQ_AVATAR,
            args: [{
                path:filePath
            }, null],
            timeoutSecond: 10 // 10秒不一定够
        });
    }

    static async getSelfInfo() {
        return await callNTQQApi<SelfInfo>({
            className: NTQQApiClass.GLOBAL_DATA,
            methodName: NTQQApiMethod.SELF_INFO, timeoutSecond: 2
        })
    }
    static async getUserInfo(uid: string) {
        const result = await callNTQQApi<{ profiles: Map<string, User> }>({
            methodName: NTQQApiMethod.USER_INFO,
            args: [{force: true, uids: [uid]}, undefined],
            cbCmd: ReceiveCmdS.USER_INFO
        })
        return result.profiles.get(uid)
    }
    static async getUserDetailInfo(uid: string) {
        const result = await callNTQQApi<{ info: User }>({
            methodName: NTQQApiMethod.USER_DETAIL_INFO,
            cbCmd: ReceiveCmdS.USER_DETAIL_INFO,
            afterFirstCmd: false,
            cmdCB: (payload) => {
                const success = payload.info.uid == uid
                // log("get user detail info", success, uid, payload)
                return success
            },
            args: [
                {
                    uid
                },
                null
            ]
        })
        const info = result.info
        if (info?.uin) {
            uidMaps[info.uid] = info.uin
        }
        return info
    }


}