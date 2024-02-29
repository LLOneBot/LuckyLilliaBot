import BaseAction from "../BaseAction";
import {OB11GroupMember, OB11User} from "../../types";
import {friends, getFriend, getGroupMember, groups} from "../../../common/data";
import {OB11Constructor} from "../../constructor";
import {ActionName} from "../types";


export default class GoCQHTTPGetStrangerInfo extends BaseAction<{user_id: number}, OB11User>{
    actionName = ActionName.GoCQHTTP_GetStrangerInfo
    protected async _handle(payload: { user_id: number }): Promise<OB11User> {
        const user_id = payload.user_id.toString()
        const friend = await getFriend(user_id)
        if (friend){
            return OB11Constructor.friend(friend);
        }
        for(const group of groups){
            const member = await getGroupMember(group.groupCode, user_id)
            if (member){
                return OB11Constructor.groupMember(group.groupCode, member) as OB11User
            }
        }
        throw ("查无此人")
    }
}