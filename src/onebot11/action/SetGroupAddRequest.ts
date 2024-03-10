import BaseAction from "./BaseAction";
import {GroupRequestOperateTypes} from "../../ntqqapi/types";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";

interface Payload {
    flag: string,
    // sub_type: "add" | "invite",
    // type: "add" | "invite"
    approve: boolean,
    reason: string
}

export default class SetGroupAddRequest extends BaseAction<Payload, null> {
    actionName = ActionName.SetGroupAddRequest

    protected async _handle(payload: Payload): Promise<null> {
        const seq = payload.flag.toString();
        await NTQQApi.handleGroupRequest(seq,
            payload.approve ? GroupRequestOperateTypes.approve : GroupRequestOperateTypes.reject,
            payload.reason
        )
        return null
    }
}