import type Adapter from '../adapter'
import GetMsg from './msg/GetMsg'
import GetLoginInfo from './system/GetLoginInfo'
import { GetFriendList } from './user/GetFriendList'
import GetGroupList from './group/GetGroupList'
import GetGroupInfo from './group/GetGroupInfo'
import GetGroupMemberList from './group/GetGroupMemberList'
import GetGroupMemberInfo from './group/GetGroupMemberInfo'
import SendGroupMsg from './group/SendGroupMsg'
import SendPrivateMsg from './msg/SendPrivateMsg'
import SendMsg from './msg/SendMsg'
import DeleteMsg from './msg/DeleteMsg'
import { BaseAction } from './BaseAction'
import GetVersionInfo from './system/GetVersionInfo'
import CanSendRecord from './system/CanSendRecord'
import CanSendImage from './system/CanSendImage'
import GetStatus from './system/GetStatus'
import {
  SendForwardMsg,
  SendGroupForwardMsg,
  SendPrivateForwardMsg,
} from './go-cqhttp/SendForwardMsg'
import { GetStrangerInfo } from './go-cqhttp/GetStrangerInfo'
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
import { MarkMsgAsRead } from './go-cqhttp/MarkMsgAsRead'
import CleanCache from './system/CleanCache'
import { GetConfigAction, SetConfigAction } from './llonebot/Config'
import GetGroupAddRequest from './llonebot/GetGroupAddRequest'
import SetQQAvatar from './llonebot/SetQQAvatar'
import { DownloadFile } from './go-cqhttp/DownloadFile'
import { GetGroupMsgHistory } from './go-cqhttp/GetGroupMsgHistory'
import GetFile from './file/GetFile'
import { GetForwardMsg } from './go-cqhttp/GetForwardMsg'
import { GetCookies } from './user/GetCookie'
import { SetMsgEmojiLike } from './llonebot/SetMsgEmojiLike'
import { ForwardFriendSingleMsg, ForwardGroupSingleMsg } from './msg/ForwardSingleMsg'
import { GetEssenceMsgList } from './go-cqhttp/GetGroupEssence'
import { GetGroupHonorInfo } from './group/GetGroupHonorInfo'
import { HandleQuickOperation } from './go-cqhttp/QuickOperation'
import { SetEssenceMsg } from './go-cqhttp/SetEssenceMsg'
import { DeleteEssenceMsg } from './go-cqhttp/DelEssenceMsg'
import { GetEvent } from './llonebot/GetEvent'
import { DelGroupFile } from './go-cqhttp/DelGroupFile'
import { GetGroupSystemMsg } from './go-cqhttp/GetGroupSystemMsg'
import { CreateGroupFileFolder } from './go-cqhttp/CreateGroupFileFolder'
import { DelGroupFolder } from './go-cqhttp/DelGroupFolder'
import { GetGroupAtAllRemain } from './go-cqhttp/GetGroupAtAllRemain'
import { GetGroupRootFiles } from './go-cqhttp/GetGroupRootFiles'
import { SetOnlineStatus } from './llonebot/SetOnlineStatus'
import { SendGroupNotice } from './go-cqhttp/SendGroupNotice'
import { GetProfileLike } from './llonebot/GetProfileLike'
import { FetchEmojiLike } from './llonebot/FetchEmojiLike'
import { FetchCustomFace } from './llonebot/FetchCustomFace'
import { GetFriendMsgHistory } from './llonebot/GetFriendMsgHistory'
import { GetGroupFilesByFolder } from './go-cqhttp/GetGroupFilesByFolder'
import { GetFriendWithCategory } from './llonebot/GetFriendWithCategory'
import { UploadGroupFile } from './go-cqhttp/UploadGroupFile'
import { UploadPrivateFile } from './go-cqhttp/UploadPrivateFile'
import { GetGroupFileUrl } from './go-cqhttp/GetGroupFileUrl'
import { GetGroupNotice } from './go-cqhttp/GetGroupNotice'
import { GetRobotUinRange } from './llonebot/GetRobotUinRange'
import { DeleteFriend } from './go-cqhttp/DeleteFriend'
import { OCRImage } from './go-cqhttp/OCRImage'
import { GroupPoke } from './llonebot/GroupPoke'
import { FriendPoke } from './llonebot/FriendPoke'
import { GetGroupFileSystemInfo } from './go-cqhttp/GetGroupFileSystemInfo'
import { GetCredentials } from './system/GetCredentials'
import { SetGroupSpecialTitle } from '@/onebot11/action/go-cqhttp/SetGroupSpecialTitle'
import { SendGroupSign } from '@/onebot11/action/go-cqhttp/SendGroupSign'
import { SetRestart } from '@/onebot11/action/system/SetRestart'
import { SetFriendCategory } from '@/onebot11/action/llonebot/SetFriendCategory'
import { SetFriendRemark } from '@/onebot11/action/llonebot/SetFriendRemark'
import { SetGroupMsgMask } from '@/onebot11/action/llonebot/SetGroupMsgMask'
import { SetGroupRemark } from '@/onebot11/action/llonebot/SetGroupRemark'

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
    new SetOnlineStatus(adapter),
    new GetProfileLike(adapter),
    new GetFriendMsgHistory(adapter),
    new FetchEmojiLike(adapter),
    new FetchCustomFace(adapter),
    new SetMsgEmojiLike(adapter),
    new GetRobotUinRange(adapter),
    new GroupPoke(adapter),
    new FriendPoke(adapter),
    new SetFriendCategory(adapter),
    new SetFriendRemark(adapter),
    new SetGroupMsgMask(adapter),
    new SetGroupRemark(adapter),
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
    new ForwardFriendSingleMsg(adapter),
    new ForwardGroupSingleMsg(adapter),
    new GetCredentials(adapter),
    new SetRestart(adapter),
    // go-cqhttp
    new GetEssenceMsgList(adapter),
    new GetGroupHonorInfo(adapter),
    new SendForwardMsg(adapter),
    new SendGroupForwardMsg(adapter),
    new SendPrivateForwardMsg(adapter),
    new GetStrangerInfo(adapter),
    new DownloadFile(adapter),
    new GetGuildList(adapter),
    new MarkMsgAsRead(adapter),
    new UploadGroupFile(adapter),
    new UploadPrivateFile(adapter),
    new GetGroupMsgHistory(adapter),
    new GetForwardMsg(adapter),
    new HandleQuickOperation(adapter),
    new SetEssenceMsg(adapter),
    new DeleteEssenceMsg(adapter),
    new DelGroupFile(adapter),
    new GetGroupSystemMsg(adapter),
    new CreateGroupFileFolder(adapter),
    new DelGroupFolder(adapter),
    new GetGroupAtAllRemain(adapter),
    new GetGroupRootFiles(adapter),
    new SendGroupNotice(adapter),
    new GetGroupFilesByFolder(adapter),
    new GetGroupFileUrl(adapter),
    new GetGroupNotice(adapter),
    new DeleteFriend(adapter),
    new OCRImage(adapter),
    new GetGroupFileSystemInfo(adapter),
    new SetGroupSpecialTitle(adapter),
    new SendGroupSign(adapter),
  ]
  const actionMap = new Map()
  for (const action of actionHandlers) {
    actionMap.set(action.actionName, action)
    actionMap.set(action.actionName + '_async', action)
    actionMap.set(action.actionName + '_rate_limited', action)
  }

  return actionMap
}
