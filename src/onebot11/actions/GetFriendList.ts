import { OB11Response } from "./utils";
import { BaseCheckResult } from "./types";
import { OB11Return, OB11User } from '../types';
import { OB11Constructor } from "../constructor";
import { friends } from "../../common/data";

export type ActionType = 'get_friend_list'

export interface PayloadType {
    action: ActionType
}

export type ReturnDataType = OB11User[]

class GetFriendList {
    static ACTION_TYPE: ActionType = 'get_friend_list'

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
        return OB11Response.ok(OB11Constructor.friends(friends));
    }
}

export default GetFriendList