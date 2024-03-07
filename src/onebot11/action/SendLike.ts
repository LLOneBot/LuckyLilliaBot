import BaseAction from "./BaseAction";
import {getFriend, getUidByUin, uidMaps} from "../../common/data";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";

interface Payload {
    user_id: number,
    times: number
}

export default class SendLike extends BaseAction<Payload, null> {
    actionName = ActionName.SendLike

    protected async _handle(payload: Payload): Promise<null> {
        const qq = payload.user_id.toString();
        const friend = await getFriend(qq)
        let uid: string;
        if (!friend) {
            uid = getUidByUin(qq)
        }
        else{
            uid = friend.uid
        }
        try {
            let result = await NTQQApi.likeFriend(uid, parseInt(payload.times?.toString()) || 1);
            if (result.result !== 0) {
                throw result.errMsg
            }
        } catch (e) {
            throw `点赞失败 ${e}`
        }
        return null
    }
}