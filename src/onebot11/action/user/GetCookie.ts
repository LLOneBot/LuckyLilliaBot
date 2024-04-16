import BaseAction from "../BaseAction";
import {NTQQUserApi} from "../../../ntqqapi/api";
import {groups} from "../../../common/data";
import {ActionName} from "../types";

export class GetCookies extends BaseAction<null, {cookies: string, bkn: string}>{
    actionName = ActionName.GetCookies;

    protected async _handle() {
        return NTQQUserApi.getCookie(groups[0])
    }
}