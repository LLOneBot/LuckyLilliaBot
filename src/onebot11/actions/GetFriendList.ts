import { OB11Response } from "./utils";
import { OB11Return, OB11User } from '../types';
import { OB11Constructor } from "../constructor";
import { friends } from "../../common/data";
import BaseAction from "./BaseAction";

export type ActionType = 'get_friend_list'

export interface PayloadType {
    action: ActionType
}

export type ReturnDataType = OB11User[]

class GetFriendList extends BaseAction {
    static ACTION_TYPE: ActionType = 'get_friend_list'

    async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        return OB11Response.ok(OB11Constructor.friends(friends));
    }
}

export default GetFriendList