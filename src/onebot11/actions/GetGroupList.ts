import { OB11Response } from "./utils";
import { BaseCheckResult } from "./types";
import { OB11Group, OB11Return } from '../types';
import { OB11Constructor } from "../constructor";
import { groups } from "../../common/data";

export type ActionType = 'get_group_list'

export interface PayloadType {
    action: ActionType
}

export type ReturnDataType = OB11Group[]

class GetGroupList {
    static ACTION_TYPE: ActionType = 'get_group_list'

    async check(jsonData: any): Promise<BaseCheckResult> {
        return {
            valid: true,
        }
    }

    async handle(jsonData: any) {
        const result = await this.check(jsonData)
        if (!result.valid) {
            return OB11Response.error(result.message)
        }
        const resData = await this._handle(jsonData)
        return resData
    }

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        return OB11Response.ok(OB11Constructor.groups(groups));
    }
}

export default GetGroupList