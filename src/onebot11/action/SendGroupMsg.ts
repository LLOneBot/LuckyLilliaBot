import SendMsg from "./SendMsg";
import {ActionName} from "./types";


class SendGroupMsg extends SendMsg{
    actionName = ActionName.SendGroupMsg
}

export default SendGroupMsg