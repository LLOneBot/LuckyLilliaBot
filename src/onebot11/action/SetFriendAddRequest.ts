import BaseAction from "./BaseAction";
import {ActionName} from "./types";
import {NTQQFriendApi} from "../../ntqqapi/api/friend";

interface Payload {
    flag: string,
    approve: boolean,
    remark?: string,
}

export default class SetFriendAddRequest extends BaseAction<Payload, null> {
    actionName = ActionName.SetFriendAddRequest;

    protected async _handle(payload: Payload): Promise<null> {
        await NTQQFriendApi.handleFriendRequest(parseInt(payload.flag), payload.approve)
        return null;
    }
}