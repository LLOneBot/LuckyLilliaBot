import SendMsg, {ReturnDataType} from "../SendMsg";
import {OB11MessageMixType, OB11PostSendMsg} from "../../types";
import {ActionName, BaseCheckResult} from "../types";

export class GoCQHTTPSendGroupForwardMsg extends SendMsg{
    actionName = ActionName.GoCQHTTP_SendGroupForwardMsg;
    protected async check(payload: OB11PostSendMsg){
        payload.message = this.convertMessage2List(payload.messages);
        return super.check(payload);
    }
}

export class GoCQHTTPSendPrivateForwardMsg extends GoCQHTTPSendGroupForwardMsg{
    actionName = ActionName.GoCQHTTP_SendPrivateForwardMsg;
}