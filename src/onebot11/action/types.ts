export type BaseCheckResult = ValidCheckResult | InvalidCheckResult

export interface ValidCheckResult {
  valid: true
}

export interface InvalidCheckResult {
  valid: false
  message: string
}

export enum ActionName {
  // llonebot
  GetGroupIgnoreAddRequest = 'get_group_ignore_add_request',
  SetQQAvatar = 'set_qq_avatar',
  GetConfig = 'get_config',
  SetConfig = 'set_config',
  Debug = 'llonebot_debug',
  GetFile = 'get_file',
  GetFriendsWithCategory = 'get_friends_with_category',
  GetEvent = 'get_event',
  SetOnlineStatus = 'set_online_status',
  GetProfileLike = 'get_profile_like',
  // onebot 11
  SendLike = 'send_like',
  GetLoginInfo = 'get_login_info',
  GetFriendList = 'get_friend_list',
  GetGroupInfo = 'get_group_info',
  GetGroupList = 'get_group_list',
  GetGroupMemberInfo = 'get_group_member_info',
  GetGroupMemberList = 'get_group_member_list',
  GetMsg = 'get_msg',
  SendMsg = 'send_msg',
  SendGroupMsg = 'send_group_msg',
  SendPrivateMsg = 'send_private_msg',
  DeleteMsg = 'delete_msg',
  SetMsgEmojiLike = 'set_msg_emoji_like',
  SetGroupAddRequest = 'set_group_add_request',
  SetFriendAddRequest = 'set_friend_add_request',
  SetGroupLeave = 'set_group_leave',
  GetVersionInfo = 'get_version_info',
  GetStatus = 'get_status',
  CanSendRecord = 'can_send_record',
  CanSendImage = 'can_send_image',
  SetGroupKick = 'set_group_kick',
  SetGroupBan = 'set_group_ban',
  SetGroupWholeBan = 'set_group_whole_ban',
  SetGroupAdmin = 'set_group_admin',
  SetGroupCard = 'set_group_card',
  SetGroupName = 'set_group_name',
  GetImage = 'get_image',
  GetRecord = 'get_record',
  CleanCache = 'clean_cache',
  GetCookies = 'get_cookies',
  ForwardFriendSingleMsg = 'forward_friend_single_msg',
  ForwardGroupSingleMsg = 'forward_group_single_msg',
  // 以下为go-cqhttp api
  GoCQHTTP_SendForwardMsg = 'send_forward_msg',
  GoCQHTTP_SendGroupForwardMsg = 'send_group_forward_msg',
  GoCQHTTP_SendPrivateForwardMsg = 'send_private_forward_msg',
  GoCQHTTP_GetStrangerInfo = 'get_stranger_info',
  GetGuildList = 'get_guild_list',
  GoCQHTTP_MarkMsgAsRead = 'mark_msg_as_read',
  GoCQHTTP_UploadGroupFile = 'upload_group_file',
  GoCQHTTP_UploadPrivateFile = 'upload_private_file',
  GoCQHTTP_DownloadFile = 'download_file',
  GoCQHTTP_GetGroupMsgHistory = 'get_group_msg_history',
  GoCQHTTP_GetForwardMsg = 'get_forward_msg',
  GoCQHTTP_GetEssenceMsg = "get_essence_msg_list",
  GoCQHTTP_HandleQuickOperation = ".handle_quick_operation",
  GetGroupHonorInfo = "get_group_honor_info",
  GoCQHTTP_SetEssenceMsg = 'set_essence_msg',
  GoCQHTTP_DelEssenceMsg = 'delete_essence_msg',
  GoCQHTTP_DelGroupFile = 'delete_group_file',
  GoCQHTTP_GetGroupSystemMsg = 'get_group_system_msg',
  GoCQHTTP_CreateGroupFileFolder = 'create_group_file_folder',
  GoCQHTTP_DelGroupFolder = 'delete_group_folder',
  GoCQHTTP_GetGroupAtAllRemain = 'get_group_at_all_remain',
  GoCQHTTP_GetGroupRootFiles = 'get_group_root_files',
  GoCQHTTP_SendGroupNotice = '_send_group_notice',
}
