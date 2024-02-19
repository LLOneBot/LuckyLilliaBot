import SendMsg from "./SendMsg";
import {ActionName} from "./types";

class SendPrivateMsg extends SendMsg {
    actionName = ActionName.SendPrivateMsg
}

export default SendPrivateMsg