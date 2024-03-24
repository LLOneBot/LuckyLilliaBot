import {OB11Group} from '../../types';
import {OB11Constructor} from "../../constructor";
import {groups} from "../../../common/data";
import BaseAction from "../BaseAction";
import {ActionName} from "../types";
import {NTQQGroupApi} from "../../../ntqqapi/api";
import {log} from "../../../common/utils";


class GetGroupList extends BaseAction<null, OB11Group[]> {
    actionName = ActionName.GetGroupList

    protected async _handle(payload: null) {
        // if (groups.length === 0) {
        //     const groups = await NTQQGroupApi.getGroups(true)
        //     log("get groups", groups)
        // }
        return OB11Constructor.groups(groups);
    }
}

export default GetGroupList