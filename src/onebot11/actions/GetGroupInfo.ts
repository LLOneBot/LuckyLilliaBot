import { OB11Response } from "./utils";
import { BaseCheckResult } from "./types";
import { OB11Group, OB11Return } from '../types';
import { getGroup, groups } from "../../common/data";
import { OB11Constructor } from "../constructor";

export type ActionType = 'get_group_info'

export interface PayloadType {
    action: ActionType
    group_id: number
}

export type ReturnDataType = OB11Group[]

class GetGroupInfo {
    static ACTION_TYPE: ActionType = 'get_group_info'

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
        const group = await getGroup(payload.group_id.toString())
        if (group) {
            return OB11Response.ok(OB11Constructor.groups(groups));
        }
        else {
            return OB11Response.error(`群${payload.group_id}不存在`)
        }
    }
}

export default GetGroupInfo