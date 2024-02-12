import { OB11Response } from "./utils";
import { msgHistory } from "../../common/data";
import { OB11Message, OB11Return } from '../types';
import { OB11Constructor } from "../constructor";
import { log } from "../../common/utils";
import BaseAction from "./BaseAction";

export type ActionType = 'get_msg'

export interface PayloadType {
    action: ActionType
    message_id: string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_msg'

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