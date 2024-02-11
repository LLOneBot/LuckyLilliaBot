import { OB11Response } from "./utils";
import { BaseCheckResult } from "./types";
import { msgHistory } from "../../common/data";
import { OB11Message, OB11Return } from '../types';
import { OB11Constructor } from "../constructor";
import { log } from "../../common/utils";

export type ActionType = 'get_msg'

export interface PayloadType {
    action: ActionType
    message_id: string
}

export type ReturnDataType = OB11Message

class GetMsg {
    static ACTION_TYPE: ActionType = 'get_msg'

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
        log("history msg ids", Object.keys(msgHistory));
        const msg = msgHistory[payload.message_id.toString()]
        if (msg) {
            const msgData = await OB11Constructor.message(msg);
            return OB11Response.ok(msgData)
        } else {
            return OB11Response.error("消息不存在")
        }
    }
}

export default GetMsg