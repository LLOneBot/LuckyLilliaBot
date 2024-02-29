import BaseAction from "./BaseAction";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";

interface Payload {
    group_id: number,
    enable: boolean
}

export default class SetGroupWholeBan extends BaseAction<Payload, null> {
    actionName = ActionName.SetGroupWholeBan

    protected async _handle(payload: Payload): Promise<null> {

        await NTQQApi.banGroup(payload.group_id.toString(), !!payload.enable)
        return null
    }
}