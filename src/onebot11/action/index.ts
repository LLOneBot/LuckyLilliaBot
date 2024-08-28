import GetMsg from './msg/GetMsg'
import GetLoginInfo from './system/GetLoginInfo'
import { GetFriendList, GetFriendWithCategory } from './user/GetFriendList'
import GetGroupList from './group/GetGroupList'
import GetGroupInfo from './group/GetGroupInfo'
import GetGroupMemberList from './group/GetGroupMemberList'
import GetGroupMemberInfo from './group/GetGroupMemberInfo'
import SendGroupMsg from './group/SendGroupMsg'
import SendPrivateMsg from './msg/SendPrivateMsg'
import SendMsg from './msg/SendMsg'
import DeleteMsg from './msg/DeleteMsg'
import BaseAction from './BaseAction'
import GetVersionInfo from './system/GetVersionInfo'
import CanSendRecord from './system/CanSendRecord'
import CanSendImage from './system/CanSendImage'
import GetStatus from './system/GetStatus'
import {
  GoCQHTTPSendForwardMsg,
  GoCQHTTPSendGroupForwardMsg,
  GoCQHTTPSendPrivateForwardMsg,
} from './go-cqhttp/SendForwardMsg'
import GoCQHTTPGetStrangerInfo from './go-cqhttp/GetStrangerInfo'
import SendLike from './user/SendLike'
import SetGroupAddRequest from './group/SetGroupAddRequest'
import SetGroupLeave from './group/SetGroupLeave'
import GetGuildList from './group/GetGuildList'
import Debug from './llonebot/Debug'
import SetFriendAddRequest from './user/SetFriendAddRequest'
import SetGroupWholeBan from './group/SetGroupWholeBan'
import SetGroupName from './group/SetGroupName'
import SetGroupBan from './group/SetGroupBan'
import SetGroupKick from './group/SetGroupKick'
import SetGroupAdmin from './group/SetGroupAdmin'
import SetGroupCard from './group/SetGroupCard'
import GetImage from './file/GetImage'
import GetRecord from './file/GetRecord'
import GoCQHTTPMarkMsgAsRead from './msg/MarkMsgAsRead'
import CleanCache from './system/CleanCache'
import { GoCQHTTPUploadGroupFile, GoCQHTTPUploadPrivateFile } from './go-cqhttp/UploadFile'
import { GetConfigAction, SetConfigAction } from './llonebot/Config'
import GetGroupAddRequest from './llonebot/GetGroupAddRequest'
import SetQQAvatar from './llonebot/SetQQAvatar'
import GoCQHTTPDownloadFile from './go-cqhttp/DownloadFile'
import GoCQHTTPGetGroupMsgHistory from './go-cqhttp/GetGroupMsgHistory'
import GetFile from './file/GetFile'
import { GoCQHTTGetForwardMsgAction } from './go-cqhttp/GetForwardMsg'
import { GetCookies } from './user/GetCookie'
import { SetMsgEmojiLike } from './msg/SetMsgEmojiLike'
import { ForwardFriendSingleMsg, ForwardGroupSingleMsg } from './msg/ForwardSingleMsg'
import { GetGroupEssence } from './group/GetGroupEssence'
import { GetGroupHonorInfo } from './group/GetGroupHonorInfo'
import { GoCQHTTHandleQuickOperation } from './go-cqhttp/QuickOperation'
import GoCQHTTPSetEssenceMsg from './go-cqhttp/SetEssenceMsg'
import GoCQHTTPDelEssenceMsg from './go-cqhttp/DelEssenceMsg'
import GetEvent from './llonebot/GetEvent'
import { GoCQHTTPDelGroupFile } from './go-cqhttp/DelGroupFile'
import type Adapter from '../adapter'

export function initActionMap(adapter: Adapter) {
  const actionHandlers = [
    new GetFile(adapter),
    new Debug(adapter),
    new GetConfigAction(adapter),
    new SetConfigAction(adapter),
    new GetGroupAddRequest(adapter),
    new SetQQAvatar(adapter),
    new GetFriendWithCategory(adapter),
    new GetEvent(adapter),
    // onebot11
    new SendLike(adapter),
    new GetMsg(adapter),
    new GetLoginInfo(adapter),
    new GetFriendList(adapter),
    new GetGroupList(adapter),
    new GetGroupInfo(adapter),
    new GetGroupMemberList(adapter),
    new GetGroupMemberInfo(adapter),
    new SendGroupMsg(adapter),
    new SendPrivateMsg(adapter),
    new SendMsg(adapter),
    new DeleteMsg(adapter),
    new SetGroupAddRequest(adapter),
    new SetFriendAddRequest(adapter),
    new SetGroupLeave(adapter),
    new GetVersionInfo(adapter),
    new CanSendRecord(adapter),
    new CanSendImage(adapter),
    new GetStatus(adapter),
    new SetGroupWholeBan(adapter),
    new SetGroupBan(adapter),
    new SetGroupKick(adapter),
    new SetGroupAdmin(adapter),
    new SetGroupName(adapter),
    new SetGroupCard(adapter),
    new GetImage(adapter),
    new GetRecord(adapter),
    new CleanCache(adapter),
    new GetCookies(adapter),
    new SetMsgEmojiLike(adapter),
    new ForwardFriendSingleMsg(adapter),
    new ForwardGroupSingleMsg(adapter),
    //以下为go-cqhttp api
    new GetGroupEssence(adapter),
    new GetGroupHonorInfo(adapter),
    new GoCQHTTPSendForwardMsg(adapter),
    new GoCQHTTPSendGroupForwardMsg(adapter),
    new GoCQHTTPSendPrivateForwardMsg(adapter),
    new GoCQHTTPGetStrangerInfo(adapter),
    new GoCQHTTPDownloadFile(adapter),
    new GetGuildList(adapter),
    new GoCQHTTPMarkMsgAsRead(adapter),
    new GoCQHTTPUploadGroupFile(adapter),
    new GoCQHTTPUploadPrivateFile(adapter),
    new GoCQHTTPGetGroupMsgHistory(adapter),
    new GoCQHTTGetForwardMsgAction(adapter),
    new GoCQHTTHandleQuickOperation(adapter),
    new GoCQHTTPSetEssenceMsg(adapter),
    new GoCQHTTPDelEssenceMsg(adapter),
    new GoCQHTTPDelGroupFile(adapter)
  ]
  const actionMap = new Map<string, BaseAction<any, any>>()
  for (const action of actionHandlers) {
    actionMap.set(action.actionName, action)
    actionMap.set(action.actionName + '_async', action)
    actionMap.set(action.actionName + '_rate_limited', action)
  }

  return actionMap
}
