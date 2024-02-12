import { OB11Response } from "./utils";
import { OB11GroupMember, OB11Return } from '../types';
import { getGroup } from "../../common/data";
import { NTQQApi } from "../../ntqqapi/ntcall";
import { OB11Constructor } from "../constructor";
import BaseAction from "./BaseAction";

export type ActionType = 'get_group_member_list'

export interface PayloadType {
    action: ActionType
    group_id: number
}

export type ReturnDataType = OB11GroupMember[]

class GetGroupMemberList extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_group_member_list'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        const group = await getGroup(payload.group_id.toString());
        if (group) {
            if (!group.members?.length) {
                group.members = await NTQQApi.getGroupMembers(payload.group_id.toString())
            }
            return OB11Response.ok(OB11Constructor.groupMembers(group));
        }
        else {
            return OB11Response.error(`群${payload.group_id}不存在`)
        }
    }
}

export default GetGroupMemberList