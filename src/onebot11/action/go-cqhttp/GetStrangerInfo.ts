import BaseAction from "../BaseAction";
import {OB11User} from "../../types";
import {getFriend, getGroupMember, groups} from "../../../common/data";
import {OB11Constructor} from "../../constructor";
import {ActionName} from "../types";
import {isNull, log} from "../../../common/utils";
import {NTQQUserApi} from "../../../ntqqapi/api/user";
import {Friend, GroupMember} from "../../../ntqqapi/types";


export default class GoCQHTTPGetStrangerInfo extends BaseAction<{ user_id: number }, OB11User> {
    actionName = ActionName.GoCQHTTP_GetStrangerInfo

    private async refreshInfo(user: Friend | GroupMember){
        if (isNull(user.sex)){
            let info = (await NTQQUserApi.getUserDetailInfo(user.uid))
            Object.assign(user, info);
        }
    }
    protected async _handle(payload: { user_id: number }): Promise<OB11User> {
        const user_id = payload.user_id.toString()
        const friend = await getFriend(user_id)
        if (friend) {
            await this.refreshInfo(friend);
            return OB11Constructor.friend(friend);
        }
        for (const group of groups) {
            const member = await getGroupMember(group.groupCode, user_id)
            if (member) {
                await this.refreshInfo(member);
                return OB11Constructor.groupMember(group.groupCode, member) as OB11User
            }
        }
        throw new Error("查无此人")
    }
}