import {getHistoryMsgByShortId} from "../../common/data";
import {OB11Message} from '../types';
import {OB11Constructor} from "../constructor";
import BaseAction from "./BaseAction";
import {ActionName} from "./types";


export interface PayloadType {
    message_id: number
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
    actionName = ActionName.GetMsg

    protected async _handle(payload: PayloadType){
        // log("history msg ids", Object.keys(msgHistory));
        if (!payload.message_id){
            throw("参数message_id不能为空")
        }
        const msg = getHistoryMsgByShortId(payload.message_id)
        if (msg) {
            const msgData = await OB11Constructor.message(msg);
            return msgData
        } else {
            throw("消息不存在")
        }
    }
}

export default GetMsg