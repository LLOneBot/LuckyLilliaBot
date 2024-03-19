import GetMsg from './GetMsg'
import GetLoginInfo from './GetLoginInfo'
import GetFriendList from './GetFriendList'
import GetGroupList from './GetGroupList'
import GetGroupInfo from './GetGroupInfo'
import GetGroupMemberList from './GetGroupMemberList'
import GetGroupMemberInfo from './GetGroupMemberInfo'
import SendGroupMsg from './SendGroupMsg'
import SendPrivateMsg from './SendPrivateMsg'
import SendMsg from './SendMsg'
import DeleteMsg from "./DeleteMsg";
import BaseAction from "./BaseAction";
import GetVersionInfo from "./GetVersionInfo";
import CanSendRecord from "./CanSendRecord";
import CanSendImage from "./CanSendImage";
import GetStatus from "./GetStatus";
import {GoCQHTTPSendGroupForwardMsg, GoCQHTTPSendPrivateForwardMsg} from "./go-cqhttp/SendForwardMsg";
import GoCQHTTPGetStrangerInfo from "./go-cqhttp/GetStrangerInfo";
import SendLike from "./SendLike";
import SetGroupAddRequest from "./SetGroupAddRequest";
import SetGroupLeave from "./SetGroupLeave";
import GetGuildList from "./GetGuildList";
import Debug from "./Debug";
import SetFriendAddRequest from "./SetFriendAddRequest";
import SetGroupWholeBan from "./SetGroupWholeBan";
import SetGroupName from "./SetGroupName";
import SetGroupBan from "./SetGroupBan";
import SetGroupKick from "./SetGroupKick";
import SetGroupAdmin from "./SetGroupAdmin";
import SetGroupCard from "./SetGroupCard";
import GetImage from "./GetImage";
import GetRecord from "./GetRecord";
import GoCQHTTPMarkMsgAsRead from "./MarkMsgAsRead";
import CleanCache from "./CleanCache";
import GoCQHTTPUploadGroupFile from "./go-cqhttp/UploadGroupFile";
import {GetConfigAction, SetConfigAction} from "./llonebot/Config";
import GetGroupAddRequest from "./llonebot/GetGroupAddRequest";
import SetQQAvatar from './llonebot/SetQQAvatar'
import GoCQHTTPDownloadFile from "./go-cqhttp/DownloadFile";
import GoCQHTTPGetGroupMsgHistory from "./go-cqhttp/GetGroupMsgHistory";

export const actionHandlers = [
    new Debug(),
    new GetConfigAction(),
    new SetConfigAction(),
    new GetGroupAddRequest(),
    new SetQQAvatar(),
    // onebot11
    new SendLike(),
    new GetMsg(),
    new GetLoginInfo(),
    new GetFriendList(),
    new GetGroupList(), new GetGroupInfo(), new GetGroupMemberList(), new GetGroupMemberInfo(),
    new SendGroupMsg(), new SendPrivateMsg(), new SendMsg(),
    new DeleteMsg(),
    new SetGroupAddRequest(),
    new SetFriendAddRequest(),
    new SetGroupLeave(),
    new GetVersionInfo(),
    new CanSendRecord(),
    new CanSendImage(),
    new GetStatus(),
    new SetGroupWholeBan(),
    new SetGroupBan(),
    new SetGroupKick(),
    new SetGroupAdmin(),
    new SetGroupName(),
    new SetGroupCard(),
    new GetImage(),
    new GetRecord(),
    new CleanCache(),

    //以下为go-cqhttp api
    new GoCQHTTPSendGroupForwardMsg(),
    new GoCQHTTPSendPrivateForwardMsg(),
    new GoCQHTTPGetStrangerInfo(),
    new GoCQHTTPDownloadFile(),
    new GetGuildList(),
    new GoCQHTTPMarkMsgAsRead(),
    new GoCQHTTPUploadGroupFile(),
    new GoCQHTTPGetGroupMsgHistory(),

]

function initActionMap() {
    const actionMap = new Map<string, BaseAction<any, any>>();
    for (const action of actionHandlers) {
        actionMap.set(action.actionName, action);
    }

    return actionMap
}

export const actionMap = initActionMap();
