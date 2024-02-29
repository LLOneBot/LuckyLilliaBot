import BaseAction from "./BaseAction";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {ActionName} from "./types";

interface Payload {
    flag: string,
    approve: boolean,
    remark?: string,
}

export default class SetFriendAddRequest extends BaseAction<Payload, null> {
    actionName = ActionName.SetFriendAddRequest;

    protected async _handle(payload: Payload): Promise<null> {
        await NTQQApi.handleFriendRequest(parseInt(payload.flag), payload.approve)
        return null;
    }
}