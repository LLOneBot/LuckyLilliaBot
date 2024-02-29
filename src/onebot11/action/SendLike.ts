import BaseAction from "./BaseAction";
import {getFriend} from "../../common/data";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";
import { log } from "../../common/utils";

interface Payload {
    user_id: number,
    times: number
}

export default class SendLike extends BaseAction<Payload, null> {
    actionName = ActionName.SendLike

    protected async _handle(payload: Payload): Promise<null> {
        const qq = payload.user_id.toString();
        const friend = await getFriend(qq)
        if (!friend) {
            throw (`点赞失败，${qq}不是好友`)
        }
        try {
            let result = await NTQQApi.likeFriend(friend.uid, parseInt(payload.times.toString()) || 1);
            if (result.result !== 0){
                throw result.errMsg
            }
        } catch (e) {
            throw `点赞失败 ${e}`
        }
        return null
    }
}