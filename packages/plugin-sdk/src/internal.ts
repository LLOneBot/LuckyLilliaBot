// Written by scripts/gen-sdk-internal.mts from the code that makes these methods; do not edit by hand.
import type { Bot } from './universal.js'

type Call = (...args: any[]) => Promise<any>

/**
 * `bot.internal` of the QQ account (`luckylillia`): OneBot 11's actions with the go-cqhttp and LLOneBot extensions,
 * camelCased. Each takes one object of the action's parameters, as the OneBot documentation has them, and resolves
 * to the action's `data`; a `message_id` may be a `session.messageId`.
 */
export interface LuckyLilliaInternal {
  /** `batch_delete_group_member` */
  batchDeleteGroupMember(params?: Record<string, unknown>): Promise<any>
  /** `can_send_image` */
  canSendImage(params?: Record<string, unknown>): Promise<any>
  /** `can_send_record` */
  canSendRecord(params?: Record<string, unknown>): Promise<any>
  /** `clean_cache` */
  cleanCache(params?: Record<string, unknown>): Promise<any>
  /** `create_group_album` */
  createGroupAlbum(params?: Record<string, unknown>): Promise<any>
  /** `create_group_file_folder` */
  createGroupFileFolder(params?: Record<string, unknown>): Promise<any>
  /** `delete_essence_msg` */
  deleteEssenceMsg(params?: Record<string, unknown>): Promise<any>
  /** `delete_friend` */
  deleteFriend(params?: Record<string, unknown>): Promise<any>
  /** `delete_group_album` */
  deleteGroupAlbum(params?: Record<string, unknown>): Promise<any>
  /** `delete_group_file` */
  deleteGroupFile(params?: Record<string, unknown>): Promise<any>
  /** `delete_group_folder` */
  deleteGroupFolder(params?: Record<string, unknown>): Promise<any>
  /** `_delete_group_notice` */
  deleteGroupNotice(params?: Record<string, unknown>): Promise<any>
  /** `delete_msg` */
  deleteMsg(params?: Record<string, unknown>): Promise<any>
  /** `download_file` */
  downloadFile(params?: Record<string, unknown>): Promise<any>
  /** `download_flash_file` */
  downloadFlashFile(params?: Record<string, unknown>): Promise<any>
  /** `fetch_custom_face` */
  fetchCustomFace(params?: Record<string, unknown>): Promise<any>
  /** `fetch_emoji_like` */
  fetchEmojiLike(params?: Record<string, unknown>): Promise<any>
  /** `forward_friend_single_msg` */
  forwardFriendSingleMsg(params?: Record<string, unknown>): Promise<any>
  /** `forward_group_single_msg` */
  forwardGroupSingleMsg(params?: Record<string, unknown>): Promise<any>
  /** `friend_poke` */
  friendPoke(params?: Record<string, unknown>): Promise<any>
  /** `get_ai_characters` */
  getAiCharacters(params?: Record<string, unknown>): Promise<any>
  /** `get_config` */
  getConfig(params?: Record<string, unknown>): Promise<any>
  /** `get_cookies` */
  getCookies(params?: Record<string, unknown>): Promise<any>
  /** `get_credentials` */
  getCredentials(params?: Record<string, unknown>): Promise<any>
  /** `get_csrf_token` */
  getCsrfToken(params?: Record<string, unknown>): Promise<any>
  /** `get_doubt_friends_add_request` */
  getDoubtFriendsAddRequest(params?: Record<string, unknown>): Promise<any>
  /** `get_essence_msg_list` */
  getEssenceMsgList(params?: Record<string, unknown>): Promise<any>
  /** `get_file` */
  getFile(params?: Record<string, unknown>): Promise<any>
  /** `get_flash_file_download_urls` */
  getFlashFileDownloadUrls(params?: Record<string, unknown>): Promise<any>
  /** `get_flash_file_info` */
  getFlashFileInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_forward_msg` */
  getForwardMsg(params?: Record<string, unknown>): Promise<any>
  /** `get_friend_list` */
  getFriendList(params?: Record<string, unknown>): Promise<any>
  /** `get_friend_msg_history` */
  getFriendMsgHistory(params?: Record<string, unknown>): Promise<any>
  /** `get_friends_with_category` */
  getFriendsWithCategory(params?: Record<string, unknown>): Promise<any>
  /** `get_group_album_list` */
  getGroupAlbumList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_album_media_list` */
  getGroupAlbumMediaList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_at_all_remain` */
  getGroupAtAllRemain(params?: Record<string, unknown>): Promise<any>
  /** `get_group_file_system_info` */
  getGroupFileSystemInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_group_file_url` */
  getGroupFileUrl(params?: Record<string, unknown>): Promise<any>
  /** `get_group_files_by_folder` */
  getGroupFilesByFolder(params?: Record<string, unknown>): Promise<any>
  /** `get_group_honor_info` */
  getGroupHonorInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_group_ignore_add_request` */
  getGroupIgnoreAddRequest(params?: Record<string, unknown>): Promise<any>
  /** `get_group_info` */
  getGroupInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_group_list` */
  getGroupList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_member_info` */
  getGroupMemberInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_group_member_list` */
  getGroupMemberList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_msg_history` */
  getGroupMsgHistory(params?: Record<string, unknown>): Promise<any>
  /** `_get_group_notice` */
  getGroupNotice(params?: Record<string, unknown>): Promise<any>
  /** `_get_group_notice_acklist` */
  getGroupNoticeAcklist(params?: Record<string, unknown>): Promise<any>
  /** `get_group_root_files` */
  getGroupRootFiles(params?: Record<string, unknown>): Promise<any>
  /** `get_group_shut_list` */
  getGroupShutList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_signed_list` */
  getGroupSignedList(params?: Record<string, unknown>): Promise<any>
  /** `get_group_system_msg` */
  getGroupSystemMsg(params?: Record<string, unknown>): Promise<any>
  /** `get_guild_list` */
  getGuildList(params?: Record<string, unknown>): Promise<any>
  /** `get_image` */
  getImage(params?: Record<string, unknown>): Promise<any>
  /** `get_login_info` */
  getLoginInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_msg` */
  getMsg(params?: Record<string, unknown>): Promise<any>
  /** `get_private_file_url` */
  getPrivateFileUrl(params?: Record<string, unknown>): Promise<any>
  /** `get_profile_like` */
  getProfileLike(params?: Record<string, unknown>): Promise<any>
  /** `get_profile_like_count` */
  getProfileLikeCount(params?: Record<string, unknown>): Promise<any>
  /** `get_profile_like_me` */
  getProfileLikeMe(params?: Record<string, unknown>): Promise<any>
  /** `get_qq_avatar` */
  getQqAvatar(params?: Record<string, unknown>): Promise<any>
  /** `get_recommend_face` */
  getRecommendFace(params?: Record<string, unknown>): Promise<any>
  /** `get_record` */
  getRecord(params?: Record<string, unknown>): Promise<any>
  /** `get_rkey` */
  getRkey(params?: Record<string, unknown>): Promise<any>
  /** `get_robot_uin_range` */
  getRobotUinRange(params?: Record<string, unknown>): Promise<any>
  /** `get_status` */
  getStatus(params?: Record<string, unknown>): Promise<any>
  /** `get_stranger_info` */
  getStrangerInfo(params?: Record<string, unknown>): Promise<any>
  /** `get_version_info` */
  getVersionInfo(params?: Record<string, unknown>): Promise<any>
  /** `group_poke` */
  groupPoke(params?: Record<string, unknown>): Promise<any>
  /** `llonebot_debug` */
  llonebotDebug(params?: Record<string, unknown>): Promise<any>
  /** `mark_msg_as_read` */
  markMsgAsRead(params?: Record<string, unknown>): Promise<any>
  /** `move_group_file` */
  moveGroupFile(params?: Record<string, unknown>): Promise<any>
  /** `ocr_image` */
  ocrImage(params?: Record<string, unknown>): Promise<any>
  /** `rename_group_file` */
  renameGroupFile(params?: Record<string, unknown>): Promise<any>
  /** `rename_group_file_folder` */
  renameGroupFileFolder(params?: Record<string, unknown>): Promise<any>
  /** `reshare_flash_file` */
  reshareFlashFile(params?: Record<string, unknown>): Promise<any>
  /** `scan_qrcode` */
  scanQrcode(params?: Record<string, unknown>): Promise<any>
  /** `send_forward_msg` */
  sendForwardMsg(params?: Record<string, unknown>): Promise<any>
  /** `send_group_ai_record` */
  sendGroupAiRecord(params?: Record<string, unknown>): Promise<any>
  /** `send_group_forward_msg` */
  sendGroupForwardMsg(params?: Record<string, unknown>): Promise<any>
  /** `send_group_msg` */
  sendGroupMsg(params?: Record<string, unknown>): Promise<any>
  /** `_send_group_notice` */
  sendGroupNotice(params?: Record<string, unknown>): Promise<any>
  /** `send_group_sign` */
  sendGroupSign(params?: Record<string, unknown>): Promise<any>
  /** `send_like` */
  sendLike(params?: Record<string, unknown>): Promise<any>
  /** `send_msg` */
  sendMsg(params?: Record<string, unknown>): Promise<any>
  /** `send_pb` */
  sendPb(params?: Record<string, unknown>): Promise<any>
  /** `send_poke` */
  sendPoke(params?: Record<string, unknown>): Promise<any>
  /** `send_private_forward_msg` */
  sendPrivateForwardMsg(params?: Record<string, unknown>): Promise<any>
  /** `send_private_msg` */
  sendPrivateMsg(params?: Record<string, unknown>): Promise<any>
  /** `set_config` */
  setConfig(params?: Record<string, unknown>): Promise<any>
  /** `set_doubt_friends_add_request` */
  setDoubtFriendsAddRequest(params?: Record<string, unknown>): Promise<any>
  /** `set_essence_msg` */
  setEssenceMsg(params?: Record<string, unknown>): Promise<any>
  /** `set_friend_add_request` */
  setFriendAddRequest(params?: Record<string, unknown>): Promise<any>
  /** `set_friend_category` */
  setFriendCategory(params?: Record<string, unknown>): Promise<any>
  /** `set_friend_remark` */
  setFriendRemark(params?: Record<string, unknown>): Promise<any>
  /** `set_group_add_request` */
  setGroupAddRequest(params?: Record<string, unknown>): Promise<any>
  /** `set_group_admin` */
  setGroupAdmin(params?: Record<string, unknown>): Promise<any>
  /** `set_group_ban` */
  setGroupBan(params?: Record<string, unknown>): Promise<any>
  /** `set_group_card` */
  setGroupCard(params?: Record<string, unknown>): Promise<any>
  /** `set_group_file_forever` */
  setGroupFileForever(params?: Record<string, unknown>): Promise<any>
  /** `set_group_kick` */
  setGroupKick(params?: Record<string, unknown>): Promise<any>
  /** `set_group_leave` */
  setGroupLeave(params?: Record<string, unknown>): Promise<any>
  /** `set_group_msg_mask` */
  setGroupMsgMask(params?: Record<string, unknown>): Promise<any>
  /** `set_group_name` */
  setGroupName(params?: Record<string, unknown>): Promise<any>
  /** `set_group_portrait` */
  setGroupPortrait(params?: Record<string, unknown>): Promise<any>
  /** `set_group_remark` */
  setGroupRemark(params?: Record<string, unknown>): Promise<any>
  /** `set_group_special_title` */
  setGroupSpecialTitle(params?: Record<string, unknown>): Promise<any>
  /** `set_group_whole_ban` */
  setGroupWholeBan(params?: Record<string, unknown>): Promise<any>
  /** `set_input_status` */
  setInputStatus(params?: Record<string, unknown>): Promise<any>
  /** `set_msg_emoji_like` */
  setMsgEmojiLike(params?: Record<string, unknown>): Promise<any>
  /** `set_online_status` */
  setOnlineStatus(params?: Record<string, unknown>): Promise<any>
  /** `set_qq_avatar` */
  setQqAvatar(params?: Record<string, unknown>): Promise<any>
  /** `set_qq_profile` */
  setQqProfile(params?: Record<string, unknown>): Promise<any>
  /** `set_restart` */
  setRestart(params?: Record<string, unknown>): Promise<any>
  /** `unset_msg_emoji_like` */
  unsetMsgEmojiLike(params?: Record<string, unknown>): Promise<any>
  /** `upload_flash_file` */
  uploadFlashFile(params?: Record<string, unknown>): Promise<any>
  /** `upload_group_album` */
  uploadGroupAlbum(params?: Record<string, unknown>): Promise<any>
  /** `upload_group_file` */
  uploadGroupFile(params?: Record<string, unknown>): Promise<any>
  /** `upload_private_file` */
  uploadPrivateFile(params?: Record<string, unknown>): Promise<any>
  /** `voice_msg_to_text` */
  voiceMsgToText(params?: Record<string, unknown>): Promise<any>
}

/**
 * `bot.internal` of the QQ official bot (`qq`): the open platform's group and C2C endpoints. Path parameters
 * come first, in order; then the body, or the query for GET and DELETE.
 */
export interface QQInternal {
  acknowledgeInteraction: Call
  approveJoinRequest: Call
  batchRemoveGroupMembers: Call
  completeUploadGuild: Call
  completeUploadPrivate: Call
  createJoinApprovalStrategy: Call
  createPanel: Call
  deleteJoinApprovalStrategy: Call
  deleteMessage: Call
  deletePanel: Call
  deletePrivateMessage: Call
  executeJoinApprovalStrategy: Call
  generateUrlLink: Call
  getBotGroupState: Call
  getGateway: Call
  getGatewayBot: Call
  getGroupInfo: Call
  getGroupMember: Call
  getGroupMemberBlacklist: Call
  getGroupMembers: Call
  getJoinApprovalStrategyList: Call
  getJoinRequestList: Call
  getMenu: Call
  getPanel: Call
  getPanels: Call
  getRestrictChatSetting: Call
  modifyGroupMemberBlacklist: Call
  modifyJoinApprovalStrategy: Call
  modifyJoinApprovalStrategyWhitelist: Call
  modifyPanel: Call
  modifyPanelTarget: Call
  sendFileGuild: Call
  sendFilePrivate: Call
  sendMessage: Call
  sendPrivateMessage: Call
  setMenu: Call
  setRestrictChatSetting: Call
  uploadPartFinishGuild: Call
  uploadPartFinishPrivate: Call
  uploadPrepareGuild: Call
  uploadPreparePrivate: Call
}

/** `bot.internal` of the QQ official bot in guilds (`qqguild`), the same way as QQInternal. */
export interface QQGuildInternal {
  addGuildMemberRole: Call
  controlChannelAudio: Call
  createDMS: Call
  createGuildAnnounce: Call
  createGuildApiPermissionDemand: Call
  createGuildChannel: Call
  createGuildRole: Call
  createPinsMessage: Call
  createPost: Call
  createReaction: Call
  createSchedule: Call
  deleteChannel: Call
  deleteDM: Call
  deleteMessage: Call
  deleteReaction: Call
  getChannel: Call
  getChannelMemberPermissions: Call
  getChannelOnlineNums: Call
  getChannelRole: Call
  getChannels: Call
  getGuild: Call
  getGuildApiPermissions: Call
  getGuildMember: Call
  getGuildMembers: Call
  getGuildRoleMembers: Call
  getGuildRoles: Call
  getGuilds: Call
  getMe: Call
  getMessage: Call
  getMessageSetting: Call
  getPinsMessage: Call
  getReactions: Call
  getSchedule: Call
  getSchedules: Call
  getThread: Call
  listThreads: Call
  modifyChannel: Call
  modifyChannelMemberPermissions: Call
  modifyChannelRole: Call
  modifyGuildRole: Call
  modifySchedule: Call
  muteGuildMember: Call
  muteGuildOrMembers: Call
  removeChannelMic: Call
  removeGuildAnnounce: Call
  removeGuildMember: Call
  removeGuildMemberRole: Call
  removeGuildRole: Call
  removePinsMessage: Call
  removePost: Call
  removeSchedule: Call
  sendDM: Call
  sendMessage: Call
  setChannelMic: Call
}

export interface PlatformInternals {
  luckylillia: LuckyLilliaInternal
  qq: QQInternal
  qqguild: QQGuildInternal
}

/**
 * The bot's `internal` with the methods of its platform typed, when the bot is on that platform; undefined otherwise:
 * `internalOf(session.bot, 'luckylillia')?.setGroupCard({ group_id, user_id, card })`.
 */
export function internalOf<P extends keyof PlatformInternals>(bot: Bot, platform: P): PlatformInternals[P] | undefined {
  return bot.platform === platform ? bot.internal as unknown as PlatformInternals[P] : undefined
}
