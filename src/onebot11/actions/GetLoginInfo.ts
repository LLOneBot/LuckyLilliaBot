import { OB11Response } from "./utils";
import { OB11Return, OB11User } from '../types';
import { OB11Constructor } from "../constructor";
import { selfInfo } from "../../common/data";
import BaseAction from "./BaseAction";

export type ActionType = 'get_login_info'

export interface PayloadType {
    action: ActionType
}

export type ReturnDataType = OB11User

class GetLoginInfo extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_login_info'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        return OB11Response.ok(OB11Constructor.selfInfo(selfInfo));
    }
}

export default GetLoginInfo