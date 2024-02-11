import { OB11PostSendMsg, OB11Return } from '../types';
import { OB11Response } from "./utils";
import { BaseCheckResult } from "./types";
import SendMsg from "./SendMsg";

export type ActionType = 'send_private_msg'

export interface PayloadType extends OB11PostSendMsg {
    action: ActionType
}

export interface ReturnDataType {
    message_id: string
}

class SendPrivateMsg {
    static ACTION_TYPE: ActionType = 'send_private_msg'

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
        // 偷懒借用现有逻辑
        return new SendMsg()._handle(payload as any)
    }
}

export default SendPrivateMsg