import BaseAction from "./BaseAction";
import {groupNotifies} from "../../common/data";
import {GroupNotify, GroupRequestOperateTypes} from "../../ntqqapi/types";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";

interface Payload{
    flag: string,
    // sub_type: "add" | "invite",
    // type: "add" | "invite"
    approve: boolean,
    reason: string
}

export default class SetGroupAddRequest extends BaseAction<Payload, null>{
    actionName = ActionName.SetGroupAddRequest
    protected async _handle(payload: Payload): Promise<null> {
        const seq = payload.flag.toString();
        const notify: GroupNotify = groupNotifies[seq]
        try{
            await NTQQApi.handleGroupRequest(seq,
                payload.approve ? GroupRequestOperateTypes.approve: GroupRequestOperateTypes.reject,
                payload.reason
                )
        }catch (e) {
            throw e
        }
        return null
    }
}