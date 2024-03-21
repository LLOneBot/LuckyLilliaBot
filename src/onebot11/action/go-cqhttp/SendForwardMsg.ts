import SendMsg from "../SendMsg";
import {OB11PostSendMsg} from "../../types";
import {ActionName} from "../types";

export class GoCQHTTPSendGroupForwardMsg extends SendMsg {
    actionName = ActionName.GoCQHTTP_SendGroupForwardMsg;

    protected async check(payload: OB11PostSendMsg) {
        if (payload.messages){
            payload.message = this.convertMessage2List(payload.messages);
        }
        return super.check(payload);
    }
}

export class GoCQHTTPSendPrivateForwardMsg extends GoCQHTTPSendGroupForwardMsg {
    actionName = ActionName.GoCQHTTP_SendPrivateForwardMsg;
}