import { OB11PostSendMsg, OB11Return } from '../types';
import SendMsg from "./SendMsg";
import BaseAction from './BaseAction';

export type ActionType = 'send_group_msg'

export interface PayloadType extends OB11PostSendMsg {
    action: ActionType
}

export interface ReturnDataType {
    message_id: string
}

class SendGroupMsg extends BaseAction {
    static ACTION_TYPE: ActionType = 'send_group_msg'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        // 偷懒借用现有逻辑
        return new SendMsg()._handle(payload as any)
    }
}

export default SendGroupMsg