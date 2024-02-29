import BaseAction from "./BaseAction";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {log} from "../../common/utils";
import {ActionName} from "./types";

interface Payload{
    group_id: number,
    is_dismiss: boolean
}

export default class SetGroupLeave extends BaseAction<Payload, any>{
    actionName = ActionName.SetGroupLeave
    protected async _handle(payload: Payload): Promise<any> {
        try{
            await NTQQApi.quitGroup(payload.group_id.toString())
        }
        catch (e) {
            log("退群失败", e)
            throw e
        }
    }
}