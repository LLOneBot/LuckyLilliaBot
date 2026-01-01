import type Adapter from '../adapter'
import { BaseAction } from './BaseAction'
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
import Debug from './llbot/system/Debug'
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
import { GetConfigAction, SetConfigAction } from './llbot/system/Config'
import GetGroupAddRequest from './llbot/group/GetGroupAddRequest'
import SetQQAvatar from './llbot/user/SetQQAvatar'
import { DownloadFile } from './go-cqhttp/DownloadFile'
import { GetGroupMsgHistory } from './go-cqhttp/GetGroupMsgHistory'
import GetFile from './file/GetFile'
import { GetForwardMsg } from './go-cqhttp/GetForwardMsg'
import { GetCookies } from './user/GetCookie'
import { SetMsgEmojiLike, UnSetMsgEmojiLike } from './llbot/msg/SetMsgEmojiLike'
import { ForwardFriendSingleMsg, ForwardGroupSingleMsg } from './llbot/msg/ForwardSingleMsg'
import { GetEssenceMsgList } from './go-cqhttp/GetGroupEssence'
import { GetGroupHonorInfo } from './group/GetGroupHonorInfo'
import { HandleQuickOperation } from './go-cqhttp/QuickOperation'
import { SetEssenceMsg } from './go-cqhttp/SetEssenceMsg'
import { DeleteEssenceMsg } from './go-cqhttp/DeleteEssenceMsg'
import { GetEvent } from './llbot/system/GetEvent'
import { DeleteGroupFile } from './go-cqhttp/DeleteGroupFile'
import { GetGroupSystemMsg } from './go-cqhttp/GetGroupSystemMsg'
import { CreateGroupFileFolder } from './go-cqhttp/CreateGroupFileFolder'
import { DeleteGroupFolder } from './go-cqhttp/DeleteGroupFolder'
import { GetGroupAtAllRemain } from './go-cqhttp/GetGroupAtAllRemain'
import { GetGroupRootFiles } from './go-cqhttp/GetGroupRootFiles'
import { SetOnlineStatus } from './llbot/user/SetOnlineStatus'
import { SendGroupNotice } from './go-cqhttp/SendGroupNotice'
import { GetProfileLikeMe } from './llbot/user/GetProfileLikeMe'
import { FetchEmojiLike } from './llbot/msg/FetchEmojiLike'
import { FetchCustomFace } from './llbot/msg/FetchCustomFace'
import { GetFriendMsgHistory } from './llbot/msg/GetFriendMsgHistory'
import { GetGroupFilesByFolder } from './go-cqhttp/GetGroupFilesByFolder'
import { GetFriendWithCategory } from './llbot/user/GetFriendWithCategory'
import { UploadGroupFile } from './go-cqhttp/UploadGroupFile'
import { UploadPrivateFile } from './go-cqhttp/UploadPrivateFile'
import { GetGroupFileUrl } from './go-cqhttp/GetGroupFileUrl'
import { GetGroupNotice } from './go-cqhttp/GetGroupNotice'
import { GetRobotUinRange } from './llbot/system/GetRobotUinRange'
import { DeleteFriend } from './go-cqhttp/DeleteFriend'
import { OCRImage } from './go-cqhttp/OCRImage'
import { GroupPoke } from './llbot/group/GroupPoke'
import { FriendPoke } from './llbot/user/FriendPoke'
import { GetGroupFileSystemInfo } from './go-cqhttp/GetGroupFileSystemInfo'
import { GetCredentials } from './system/GetCredentials'
import { SetGroupSpecialTitle } from './go-cqhttp/SetGroupSpecialTitle'
import { SendGroupSign } from './go-cqhttp/SendGroupSign'
import { SetRestart } from './system/SetRestart'
import { SetFriendCategory } from './llbot/user/SetFriendCategory'
import { SetFriendRemark } from './llbot/user/SetFriendRemark'
import { SetGroupMsgMask } from './llbot/group/SetGroupMsgMask'
import { SetGroupRemark } from './llbot/group/SetGroupRemark'
import { SetQQProfile } from './go-cqhttp/SetQQProfile'
import { GetProfileLike } from './llbot/user/GetProfileLike'
import { GetCsrfToken } from './system/GetCsrfToken'
import { SetGroupPortrait } from './go-cqhttp/SetGroupPortrait'
import { MoveGroupFile } from './llbot/file/MoveGroupFile'
import { GetGroupShutList } from './llbot/group/GetGroupShutList'
import { RenameGroupFileFolder } from './llbot/file/RenameGroupFileFolder'
import { VoiceMsg2Text } from '@/onebot11/action/llbot/msg/VoiceMsg2Text'
import { SendPB } from './llbot/system/SendPB'
import { GetRKey } from '@/onebot11/action/llbot/file/GetRkey'
import { UploadFlashFile } from '@/onebot11/action/llbot/file/UploadFlashFile'
import { GetQQAvatar } from '@/onebot11/action/llbot/user/GetQQAvatar'
import { DownloadFlashFile } from '@/onebot11/action/llbot/file/DownloadFlashFile'
import { GetFlashFileInfo } from '@/onebot11/action/llbot/file/GetFlashFileInfo'
import { GetRecommendFace } from './llbot/msg/GetRecommendFace'
import { BatchDeleteGroupMember } from '@/onebot11/action/llbot/group/BatchDeleteGroupMember'
import { GetAiCharacters } from './llbot/msg/GetAiCharacters'
import { SendGroupAiRecord } from './llbot/msg/SendGroupAiRecord'
import { GetPrivateFileUrl } from './llbot/file/GetPrivateFileUrl'
import { GetDoubtFriendsAddRequest } from './llbot/user/GetDoubtFriendsAddRequest'
import { SetDoubtFriendsAddRequest } from './llbot/user/SetDoubtFriendsAddRequest'
import { SetGroupFileForever } from '@/onebot11/action/llbot/file/SetGroupFileForever'
import { UploadGroupAlbum } from '@/onebot11/action/llbot/group/GroupAlbum/UploadGroupAlbum'
import { GetGroupAlbumList } from '@/onebot11/action/llbot/group/GroupAlbum/GetGroupAlbumList'
import { CreateGroupAlbum } from '@/onebot11/action/llbot/group/GroupAlbum/CreateGroupAlbum'
import { DeleteGroupNotice } from './llbot/group/DeleteGroupNotice'
import { DeleteGroupAlbum } from '@/onebot11/action/llbot/group/GroupAlbum/DeleteGroupAlbum'
import { ScanQRCode } from '@/onebot11/action/llbot/system/ScanQRCode'

export function initActionMap(adapter: Adapter) {
  const actionHandlers = [
    // llbot
    new ScanQRCode(adapter),
    new CreateGroupAlbum(adapter),
    new DeleteGroupAlbum(adapter),
    new GetGroupAlbumList(adapter),
    new UploadGroupAlbum(adapter),
    new SetGroupFileForever(adapter),
    new BatchDeleteGroupMember(adapter),
    new GetFlashFileInfo(adapter),
    new DownloadFlashFile(adapter),
    new UploadFlashFile(adapter),
    new GetRKey(adapter),
    new SendPB(adapter),
    new VoiceMsg2Text(adapter),
    new GetFile(adapter),
    new Debug(adapter),
    new GetConfigAction(adapter),
    new SetConfigAction(adapter),
    new GetGroupAddRequest(adapter),
    new SetQQAvatar(adapter),
    new GetQQAvatar(adapter),
    new GetFriendWithCategory(adapter),
    new GetEvent(adapter),
    new SetOnlineStatus(adapter),
    new GetProfileLike(adapter),
    new GetProfileLikeMe(adapter),
    new GetFriendMsgHistory(adapter),
    new FetchEmojiLike(adapter),
    new FetchCustomFace(adapter),
    new SetMsgEmojiLike(adapter),
    new UnSetMsgEmojiLike(adapter),
    new GetRobotUinRange(adapter),
    new GroupPoke(adapter),
    new FriendPoke(adapter),
    new SetFriendCategory(adapter),
    new SetFriendRemark(adapter),
    new SetGroupMsgMask(adapter),
    new SetGroupRemark(adapter),
    new MoveGroupFile(adapter),
    new GetGroupShutList(adapter),
    new RenameGroupFileFolder(adapter),
    new GetRecommendFace(adapter),
    new GetAiCharacters(adapter),
    new SendGroupAiRecord(adapter),
    new GetPrivateFileUrl(adapter),
    new GetDoubtFriendsAddRequest(adapter),
    new SetDoubtFriendsAddRequest(adapter),
    new DeleteGroupNotice(adapter),
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
    new GetCsrfToken(adapter),
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
    new DeleteGroupFile(adapter),
    new GetGroupSystemMsg(adapter),
    new CreateGroupFileFolder(adapter),
    new DeleteGroupFolder(adapter),
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
    new SetQQProfile(adapter),
    new SetGroupPortrait(adapter),
  ]
  const actionMap: Map<string, BaseAction<any, unknown>> = new Map()
  for (const action of actionHandlers) {
    actionMap.set(action.actionName, action)
    actionMap.set(action.actionName + '_async', action)
    actionMap.set(action.actionName + '_rate_limited', action)
  }

  return actionMap
}
