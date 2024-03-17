import BaseAction from "./BaseAction";
import {log} from "../../common/utils";
import {ActionName} from "./types";
import {NTQQGroupApi} from "../../ntqqapi/api/group";

interface Payload {
    group_id: number,
    is_dismiss: boolean
}

export default class SetGroupLeave extends BaseAction<Payload, any> {
    actionName = ActionName.SetGroupLeave

    protected async _handle(payload: Payload): Promise<any> {
        try {
            await NTQQGroupApi.quitGroup(payload.group_id.toString())
        } catch (e) {
            log("退群失败", e)
            throw e
        }
    }
}