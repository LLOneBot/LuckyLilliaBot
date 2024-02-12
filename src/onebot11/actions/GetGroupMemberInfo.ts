import { OB11Response } from "./utils";
import { OB11GroupMember, OB11Return } from '../types';
import { getGroupMember } from "../../common/data";
import { OB11Constructor } from "../constructor";
import BaseAction from "./BaseAction";

export type ActionType = 'get_group_member_info'

export interface PayloadType {
    action: ActionType
    group_id: number
    user_id: number
}

export type ReturnDataType = OB11GroupMember

class GetGroupMemberInfo extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_group_member_info'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        const member = await getGroupMember(payload.group_id.toString(), payload.user_id.toString())
        if (member) {
            return OB11Response.ok(OB11Constructor.groupMember(payload.group_id.toString(), member))
        }
        else {
            return OB11Response.error(`群成员${payload.user_id}不存在`)
        }
    }
}

export default GetGroupMemberInfo