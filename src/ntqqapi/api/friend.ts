import {Friend, FriendRequest} from "../types";
import {ReceiveCmdS} from "../hook";
import {callNTQQApi, GeneralCallResult, NTQQApiMethod} from "../ntcall";
import {friendRequests} from "../../common/data";

export class NTQQFriendApi{
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
                cbCmd: ReceiveCmdS.FRIENDS
            })
        let _friends: Friend[] = [];
        for (const fData of data.data) {
            _friends.push(...fData.buddyList)
        }
        return _friends
    }
    static async likeFriend(uid: string, count = 1) {
        return await callNTQQApi<GeneralCallResult>({
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
    static async handleFriendRequest(flag: string, accept: boolean,) {
        const request: FriendRequest = friendRequests[flag]
        if (!request) {
            throw `flat: ${flag}, 对应的好友请求不存在`
        }
        const result = await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.HANDLE_FRIEND_REQUEST,
            args: [
                {
                    "approvalInfo": {
                        "friendUid": request.friendUid,
                        "reqTime": request.reqTime,
                        accept
                    }
                }
            ]
        })
        delete friendRequests[flag];
        return result;
    }

}