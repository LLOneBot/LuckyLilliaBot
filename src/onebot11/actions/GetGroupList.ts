import { OB11Response } from "./utils";
import { OB11Group, OB11Return } from '../types';
import { OB11Constructor } from "../constructor";
import { groups } from "../../common/data";
import BaseAction from "./BaseAction";

export type ActionType = 'get_group_list'

export interface PayloadType {
    action: ActionType
}

export type ReturnDataType = OB11Group[]

class GetGroupList extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_group_list'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        return OB11Response.ok(OB11Constructor.groups(groups));
    }
}

export default GetGroupList