// Generated from Milky 1.3 (1.3.0-rc.1)
import { z } from 'zod';

export const milkyVersion = '1.3';
export const milkyPackageVersion = '1.3.0-rc.1';

export const zUin = z.number().int().min(10001).max(4294967295);

export function zDropBadElementArray<const T extends z.ZodDiscriminatedUnion>(element: T) {
  const schema = z.array(element.catch(null as never)).transform((val) => val.filter((item) => item !== null));
  return schema as unknown as z.ZodPipe<z.ZodArray<z.ZodCatch<z.ZodLazy<T>>>, z.ZodArray<z.ZodLazy<T>>>;
}

// ####################################
// Common Structs
// ####################################

export const BotOfflineEventData = z.object({
  reason: z.string().describe('下线原因'),
}).describe('机器人离线事件');
export type BotOfflineEventData = z.infer<typeof BotOfflineEventData>;

export const BotOfflineEvent = BotOfflineEventData;
export type BotOfflineEvent = z.infer<typeof BotOfflineEventData>;

export const MessageRecallEventData = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('消息场景'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  sender_id: zUin.describe('被撤回的消息的发送者 QQ 号'),
  operator_id: zUin.describe('操作者 QQ 号'),
  display_suffix: z.string().describe('撤回提示的后缀文本'),
}).describe('消息撤回事件');
export type MessageRecallEventData = z.infer<typeof MessageRecallEventData>;

export const MessageRecallEvent = MessageRecallEventData;
export type MessageRecallEvent = z.infer<typeof MessageRecallEventData>;

export const PeerPinChangeEventData = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('发生改变的会话的消息场景'),
  peer_id: zUin.describe('发生改变的好友 QQ 号或群号'),
  is_pinned: z.boolean().describe('是否被置顶, `false` 表示取消置顶'),
}).describe('会话置顶变更事件');
export type PeerPinChangeEventData = z.infer<typeof PeerPinChangeEventData>;

export const PeerPinChangeEvent = PeerPinChangeEventData;
export type PeerPinChangeEvent = z.infer<typeof PeerPinChangeEventData>;

export const FriendRequestEventData = z.object({
  initiator_id: zUin.describe('申请好友的用户 QQ 号'),
  initiator_uid: z.string().describe('用户 UID'),
  comment: z.string().describe('申请附加信息'),
  via: z.string().describe('申请来源'),
}).describe('好友请求事件');
export type FriendRequestEventData = z.infer<typeof FriendRequestEventData>;

export const FriendRequestEvent = FriendRequestEventData;
export type FriendRequestEvent = z.infer<typeof FriendRequestEventData>;

export const GroupJoinRequestEventData = z.object({
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('请求对应的通知序列号'),
  is_filtered: z.boolean().describe('请求是否被过滤（发起自风险账户）'),
  initiator_id: zUin.describe('申请入群的用户 QQ 号'),
  comment: z.string().describe('申请附加信息'),
}).describe('入群请求事件');
export type GroupJoinRequestEventData = z.infer<typeof GroupJoinRequestEventData>;

export const GroupJoinRequestEvent = GroupJoinRequestEventData;
export type GroupJoinRequestEvent = z.infer<typeof GroupJoinRequestEventData>;

export const GroupInvitedJoinRequestEventData = z.object({
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('请求对应的通知序列号'),
  initiator_id: zUin.describe('邀请者 QQ 号'),
  target_user_id: zUin.describe('被邀请者 QQ 号'),
}).describe('群成员邀请他人入群请求事件');
export type GroupInvitedJoinRequestEventData = z.infer<typeof GroupInvitedJoinRequestEventData>;

export const GroupInvitedJoinRequestEvent = GroupInvitedJoinRequestEventData;
export type GroupInvitedJoinRequestEvent = z.infer<typeof GroupInvitedJoinRequestEventData>;

export const GroupInvitationEventData = z.object({
  group_id: zUin.describe('群号'),
  invitation_seq: z.number().int().nonnegative().describe('邀请序列号'),
  initiator_id: zUin.describe('邀请者 QQ 号'),
  source_group_id: z.number().int().nonnegative().nullish().describe('来源群号，如果是通过 QQ 群邀请'),
}).describe('他人邀请自身入群事件');
export type GroupInvitationEventData = z.infer<typeof GroupInvitationEventData>;

export const GroupInvitationEvent = GroupInvitationEventData;
export type GroupInvitationEvent = z.infer<typeof GroupInvitationEventData>;

export const FriendNudgeEventData = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  is_self_send: z.boolean().describe('是否是自己发送的戳一戳'),
  is_self_receive: z.boolean().describe('是否是自己接收的戳一戳'),
  display_action: z.string().describe('戳一戳提示的动作文本'),
  display_suffix: z.string().describe('戳一戳提示的后缀文本'),
  display_action_img_url: z.string().describe('戳一戳提示的动作图片 URL，用于取代动作提示文本'),
}).describe('好友戳一戳事件');
export type FriendNudgeEventData = z.infer<typeof FriendNudgeEventData>;

export const FriendNudgeEvent = FriendNudgeEventData;
export type FriendNudgeEvent = z.infer<typeof FriendNudgeEventData>;

export const FriendFileUploadEventData = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  file_id: z.string().describe('文件 ID'),
  file_name: z.string().describe('文件名称'),
  file_size: z.number().int().nonnegative().describe('文件大小（字节）'),
  file_hash: z.string().describe('文件的 TriSHA1 哈希值'),
  is_self: z.boolean().describe('是否是自己发送的文件'),
}).describe('好友文件上传事件');
export type FriendFileUploadEventData = z.infer<typeof FriendFileUploadEventData>;

export const FriendFileUploadEvent = FriendFileUploadEventData;
export type FriendFileUploadEvent = z.infer<typeof FriendFileUploadEventData>;

export const GroupAdminChangeEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发生变更的用户 QQ 号'),
  operator_id: zUin.describe('操作者 QQ 号'),
  is_set: z.boolean().describe('是否被设置为管理员，`false` 表示被取消管理员'),
}).describe('群管理员变更事件');
export type GroupAdminChangeEventData = z.infer<typeof GroupAdminChangeEventData>;

export const GroupAdminChangeEvent = GroupAdminChangeEventData;
export type GroupAdminChangeEvent = z.infer<typeof GroupAdminChangeEventData>;

export const GroupEssenceMessageChangeEventData = z.object({
  group_id: zUin.describe('群号'),
  message_seq: z.number().int().nonnegative().describe('发生变更的消息序列号'),
  operator_id: zUin.describe('操作者 QQ 号'),
  is_set: z.boolean().describe('是否被设置为精华，`false` 表示被取消精华'),
}).describe('群精华消息变更事件');
export type GroupEssenceMessageChangeEventData = z.infer<typeof GroupEssenceMessageChangeEventData>;

export const GroupEssenceMessageChangeEvent = GroupEssenceMessageChangeEventData;
export type GroupEssenceMessageChangeEvent = z.infer<typeof GroupEssenceMessageChangeEventData>;

export const GroupMemberIncreaseEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发生变更的用户 QQ 号'),
  operator_id: z.number().int().nonnegative().nullish().describe('管理员 QQ 号，如果是管理员同意入群'),
  invitor_id: z.number().int().nonnegative().nullish().describe('邀请者 QQ 号，如果是邀请入群'),
}).describe('群成员增加事件');
export type GroupMemberIncreaseEventData = z.infer<typeof GroupMemberIncreaseEventData>;

export const GroupMemberIncreaseEvent = GroupMemberIncreaseEventData;
export type GroupMemberIncreaseEvent = z.infer<typeof GroupMemberIncreaseEventData>;

export const GroupMemberDecreaseEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发生变更的用户 QQ 号'),
  operator_id: z.number().int().nonnegative().nullish().describe('管理员 QQ 号，如果是管理员踢出'),
}).describe('群成员减少事件');
export type GroupMemberDecreaseEventData = z.infer<typeof GroupMemberDecreaseEventData>;

export const GroupMemberDecreaseEvent = GroupMemberDecreaseEventData;
export type GroupMemberDecreaseEvent = z.infer<typeof GroupMemberDecreaseEventData>;

export const GroupDisbandEventData = z.object({
  group_id: zUin.describe('群号'),
  operator_id: zUin.describe('操作者 QQ 号'),
}).describe('群解散事件');
export type GroupDisbandEventData = z.infer<typeof GroupDisbandEventData>;

export const GroupDisbandEvent = GroupDisbandEventData;
export type GroupDisbandEvent = z.infer<typeof GroupDisbandEventData>;

export const GroupNameChangeEventData = z.object({
  group_id: zUin.describe('群号'),
  new_group_name: z.string().describe('新的群名称'),
  operator_id: zUin.describe('操作者 QQ 号'),
}).describe('群名称变更事件');
export type GroupNameChangeEventData = z.infer<typeof GroupNameChangeEventData>;

export const GroupNameChangeEvent = GroupNameChangeEventData;
export type GroupNameChangeEvent = z.infer<typeof GroupNameChangeEventData>;

export const GroupMessageReactionEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发送回应者 QQ 号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  face_id: z.string().describe('表情 ID'),
  reaction_type: z.enum(['face', 'emoji']).describe('收到的回应类型'),
  is_add: z.boolean().describe('是否为添加，`false` 表示取消回应'),
}).describe('群消息表情回应事件');
export type GroupMessageReactionEventData = z.infer<typeof GroupMessageReactionEventData>;

export const GroupMessageReactionEvent = GroupMessageReactionEventData;
export type GroupMessageReactionEvent = z.infer<typeof GroupMessageReactionEventData>;

export const GroupMuteEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发生变更的用户 QQ 号'),
  operator_id: zUin.describe('操作者 QQ 号'),
  duration: z.number().int().nonnegative().describe('禁言时长（秒），为 0 表示取消禁言'),
}).describe('群禁言事件');
export type GroupMuteEventData = z.infer<typeof GroupMuteEventData>;

export const GroupMuteEvent = GroupMuteEventData;
export type GroupMuteEvent = z.infer<typeof GroupMuteEventData>;

export const GroupWholeMuteEventData = z.object({
  group_id: zUin.describe('群号'),
  operator_id: zUin.describe('操作者 QQ 号'),
  is_mute: z.boolean().describe('是否全员禁言，`false` 表示取消全员禁言'),
}).describe('群全体禁言事件');
export type GroupWholeMuteEventData = z.infer<typeof GroupWholeMuteEventData>;

export const GroupWholeMuteEvent = GroupWholeMuteEventData;
export type GroupWholeMuteEvent = z.infer<typeof GroupWholeMuteEventData>;

export const GroupNudgeEventData = z.object({
  group_id: zUin.describe('群号'),
  sender_id: zUin.describe('发送者 QQ 号'),
  receiver_id: zUin.describe('接收者 QQ 号'),
  display_action: z.string().describe('戳一戳提示的动作文本'),
  display_suffix: z.string().describe('戳一戳提示的后缀文本'),
  display_action_img_url: z.string().describe('戳一戳提示的动作图片 URL，用于取代动作提示文本'),
}).describe('群戳一戳事件');
export type GroupNudgeEventData = z.infer<typeof GroupNudgeEventData>;

export const GroupNudgeEvent = GroupNudgeEventData;
export type GroupNudgeEvent = z.infer<typeof GroupNudgeEventData>;

export const GroupFileUploadEventData = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('发送者 QQ 号'),
  file_id: z.string().describe('文件 ID'),
  file_name: z.string().describe('文件名称'),
  file_size: z.number().int().nonnegative().describe('文件大小（字节）'),
}).describe('群文件上传事件');
export type GroupFileUploadEventData = z.infer<typeof GroupFileUploadEventData>;

export const GroupFileUploadEvent = GroupFileUploadEventData;
export type GroupFileUploadEvent = z.infer<typeof GroupFileUploadEventData>;

export const Event = z.discriminatedUnion('event_type', [
  z.object({
    event_type: z.literal('bot_offline'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: BotOfflineEventData.describe('机器人离线事件'),
  }).describe('机器人离线事件'),

  z.object({
    event_type: z.literal('message_receive'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: z.lazy(() => IncomingMessage).describe('消息接收事件'),
  }).describe('消息接收事件'),

  z.object({
    event_type: z.literal('message_recall'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: MessageRecallEventData.describe('消息撤回事件'),
  }).describe('消息撤回事件'),

  z.object({
    event_type: z.literal('peer_pin_change'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: PeerPinChangeEventData.describe('会话置顶变更事件'),
  }).describe('会话置顶变更事件'),

  z.object({
    event_type: z.literal('friend_request'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: FriendRequestEventData.describe('好友请求事件'),
  }).describe('好友请求事件'),

  z.object({
    event_type: z.literal('group_join_request'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupJoinRequestEventData.describe('入群请求事件'),
  }).describe('入群请求事件'),

  z.object({
    event_type: z.literal('group_invited_join_request'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupInvitedJoinRequestEventData.describe('群成员邀请他人入群请求事件'),
  }).describe('群成员邀请他人入群请求事件'),

  z.object({
    event_type: z.literal('group_invitation'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupInvitationEventData.describe('他人邀请自身入群事件'),
  }).describe('他人邀请自身入群事件'),

  z.object({
    event_type: z.literal('friend_nudge'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: FriendNudgeEventData.describe('好友戳一戳事件'),
  }).describe('好友戳一戳事件'),

  z.object({
    event_type: z.literal('friend_file_upload'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: FriendFileUploadEventData.describe('好友文件上传事件'),
  }).describe('好友文件上传事件'),

  z.object({
    event_type: z.literal('group_admin_change'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupAdminChangeEventData.describe('群管理员变更事件'),
  }).describe('群管理员变更事件'),

  z.object({
    event_type: z.literal('group_essence_message_change'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupEssenceMessageChangeEventData.describe('群精华消息变更事件'),
  }).describe('群精华消息变更事件'),

  z.object({
    event_type: z.literal('group_member_increase'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupMemberIncreaseEventData.describe('群成员增加事件'),
  }).describe('群成员增加事件'),

  z.object({
    event_type: z.literal('group_member_decrease'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupMemberDecreaseEventData.describe('群成员减少事件'),
  }).describe('群成员减少事件'),

  z.object({
    event_type: z.literal('group_disband'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupDisbandEventData.describe('群解散事件'),
  }).describe('群解散事件'),

  z.object({
    event_type: z.literal('group_name_change'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupNameChangeEventData.describe('群名称变更事件'),
  }).describe('群名称变更事件'),

  z.object({
    event_type: z.literal('group_message_reaction'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupMessageReactionEventData.describe('群消息表情回应事件'),
  }).describe('群消息表情回应事件'),

  z.object({
    event_type: z.literal('group_mute'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupMuteEventData.describe('群禁言事件'),
  }).describe('群禁言事件'),

  z.object({
    event_type: z.literal('group_whole_mute'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupWholeMuteEventData.describe('群全体禁言事件'),
  }).describe('群全体禁言事件'),

  z.object({
    event_type: z.literal('group_nudge'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupNudgeEventData.describe('群戳一戳事件'),
  }).describe('群戳一戳事件'),

  z.object({
    event_type: z.literal('group_file_upload'),
    time: z.number().int().nonnegative().describe('事件 Unix 时间戳（秒）'),
    self_id: zUin.describe('机器人 QQ 号'),
    data: GroupFileUploadEventData.describe('群文件上传事件'),
  }).describe('群文件上传事件'),
]).describe('事件');
export type Event = z.infer<typeof Event>;

export const FriendEntity = z.object({
  user_id: zUin.describe('用户 QQ 号'),
  nickname: z.string().describe('用户昵称'),
  sex: z.enum(['male', 'female', 'unknown']).describe('用户性别'),
  qid: z.string().describe('用户 QID'),
  remark: z.string().describe('好友备注'),
  category: z.lazy(() => FriendCategoryEntity).describe('好友分组'),
}).describe('好友实体');
export type FriendEntity = z.infer<typeof FriendEntity>;

export const FriendCategoryEntity = z.object({
  category_id: z.number().int().nonnegative().describe('好友分组 ID'),
  category_name: z.string().describe('好友分组名称'),
}).describe('好友分组实体');
export type FriendCategoryEntity = z.infer<typeof FriendCategoryEntity>;

export const GroupEntity = z.object({
  group_id: zUin.describe('群号'),
  group_name: z.string().describe('群名称'),
  member_count: z.number().int().nonnegative().describe('群成员数量'),
  max_member_count: z.number().int().nonnegative().describe('群容量'),
  remark: z.string().describe('群备注'),
  created_time: z.number().int().nonnegative().describe('群创建时间，Unix 时间戳（秒）'),
  description: z.string().describe('群简介'),
  question: z.string().describe('加群验证问题'),
  announcement: z.string().describe('群公告预览'),
}).describe('群实体');
export type GroupEntity = z.infer<typeof GroupEntity>;

export const GroupMemberEntity = z.object({
  user_id: zUin.describe('用户 QQ 号'),
  nickname: z.string().describe('用户昵称'),
  sex: z.enum(['male', 'female', 'unknown']).describe('用户性别'),
  group_id: zUin.describe('群号'),
  card: z.string().describe('成员备注'),
  title: z.string().describe('专属头衔'),
  level: z.number().int().nonnegative().describe('群等级，注意和 QQ 等级区分'),
  role: z.enum(['owner', 'admin', 'member']).describe('权限等级'),
  join_time: z.number().int().nonnegative().describe('入群时间，Unix 时间戳（秒）'),
  last_sent_time: z.number().int().nonnegative().describe('最后发言时间，Unix 时间戳（秒）'),
  shut_up_end_time: z.number().int().nonnegative().nullish().describe('禁言结束时间，Unix 时间戳（秒）'),
}).describe('群成员实体');
export type GroupMemberEntity = z.infer<typeof GroupMemberEntity>;

export const GroupAnnouncementEntity = z.object({
  group_id: zUin.describe('群号'),
  announcement_id: z.string().describe('公告 ID'),
  user_id: zUin.describe('发送者 QQ 号'),
  time: z.number().int().nonnegative().describe('Unix 时间戳（秒）'),
  content: z.string().describe('公告内容'),
  image_url: z.string().nullish().describe('公告图片 URL'),
}).describe('群公告实体');
export type GroupAnnouncementEntity = z.infer<typeof GroupAnnouncementEntity>;

export const GroupFileEntity = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
  file_name: z.string().describe('文件名称'),
  parent_folder_id: z.string().describe('父文件夹 ID'),
  file_size: z.number().int().nonnegative().describe('文件大小（字节）'),
  uploaded_time: z.number().int().nonnegative().describe('上传时的 Unix 时间戳（秒）'),
  expire_time: z.number().int().nonnegative().nullish().describe('过期时的 Unix 时间戳（秒）'),
  uploader_id: zUin.describe('上传者 QQ 号'),
  downloaded_times: z.number().int().nonnegative().describe('下载次数'),
}).describe('群文件实体');
export type GroupFileEntity = z.infer<typeof GroupFileEntity>;

export const GroupFolderEntity = z.object({
  group_id: zUin.describe('群号'),
  folder_id: z.string().describe('文件夹 ID'),
  parent_folder_id: z.string().describe('父文件夹 ID'),
  folder_name: z.string().describe('文件夹名称'),
  created_time: z.number().int().nonnegative().describe('创建时的 Unix 时间戳（秒）'),
  last_modified_time: z.number().int().nonnegative().describe('最后修改时的 Unix 时间戳（秒）'),
  creator_id: zUin.describe('创建者 QQ 号'),
  file_count: z.number().int().nonnegative().describe('文件数量'),
}).describe('群文件夹实体');
export type GroupFolderEntity = z.infer<typeof GroupFolderEntity>;

export const FriendRequest = z.object({
  time: z.number().int().nonnegative().describe('请求发起时的 Unix 时间戳（秒）'),
  initiator_id: zUin.describe('请求发起者 QQ 号'),
  initiator_uid: z.string().describe('请求发起者 UID'),
  target_user_id: zUin.describe('目标用户 QQ 号'),
  target_user_uid: z.string().describe('目标用户 UID'),
  state: z.enum(['pending', 'accepted', 'rejected', 'ignored']).describe('请求状态'),
  comment: z.string().describe('申请附加信息'),
  via: z.string().describe('申请来源'),
  is_filtered: z.boolean().describe('请求是否被过滤（发起自风险账户）'),
}).describe('好友请求实体');
export type FriendRequest = z.infer<typeof FriendRequest>;

export const GroupJoinRequestNotification = z.object({
  type: z.literal('join_request'),
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('通知序列号'),
  is_filtered: z.boolean().describe('请求是否被过滤（发起自风险账户）'),
  initiator_id: zUin.describe('发起者 QQ 号'),
  state: z.enum(['pending', 'accepted', 'rejected', 'ignored']).describe('请求状态'),
  operator_id: z.number().int().nonnegative().nullish().describe('处理请求的管理员 QQ 号'),
  comment: z.string().describe('入群请求附加信息'),
}).describe('用户入群请求');
export type GroupJoinRequestNotification = z.infer<typeof GroupJoinRequestNotification>;

export const GroupAdminChangeNotification = z.object({
  type: z.literal('admin_change'),
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('通知序列号'),
  target_user_id: zUin.describe('被设置/取消用户 QQ 号'),
  is_set: z.boolean().describe('是否被设置为管理员，`false` 表示被取消管理员'),
  operator_id: zUin.describe('操作者（群主）QQ 号'),
}).describe('群管理员变更通知');
export type GroupAdminChangeNotification = z.infer<typeof GroupAdminChangeNotification>;

export const GroupKickNotification = z.object({
  type: z.literal('kick'),
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('通知序列号'),
  target_user_id: zUin.describe('被移除用户 QQ 号'),
  operator_id: zUin.describe('移除用户的管理员 QQ 号'),
}).describe('群成员被移除通知');
export type GroupKickNotification = z.infer<typeof GroupKickNotification>;

export const GroupQuitNotification = z.object({
  type: z.literal('quit'),
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('通知序列号'),
  target_user_id: zUin.describe('退群用户 QQ 号'),
}).describe('群成员退群通知');
export type GroupQuitNotification = z.infer<typeof GroupQuitNotification>;

export const GroupInvitedJoinRequestNotification = z.object({
  type: z.literal('invited_join_request'),
  group_id: zUin.describe('群号'),
  notification_seq: z.number().int().nonnegative().describe('通知序列号'),
  initiator_id: zUin.describe('邀请者 QQ 号'),
  target_user_id: zUin.describe('被邀请用户 QQ 号'),
  state: z.enum(['pending', 'accepted', 'rejected', 'ignored']).describe('请求状态'),
  operator_id: z.number().int().nonnegative().nullish().describe('处理请求的管理员 QQ 号'),
}).describe('群成员邀请他人入群请求');
export type GroupInvitedJoinRequestNotification = z.infer<typeof GroupInvitedJoinRequestNotification>;

export const GroupNotification = z.discriminatedUnion('type', [
  GroupJoinRequestNotification,
  GroupAdminChangeNotification,
  GroupKickNotification,
  GroupQuitNotification,
  GroupInvitedJoinRequestNotification,
]).describe('群通知实体');
export type GroupNotification = z.infer<typeof GroupNotification>;

export const IncomingFriendMessage = z.object({
  message_scene: z.literal('friend'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  sender_id: zUin.describe('发送者 QQ 号'),
  time: z.number().int().nonnegative().describe('消息 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => IncomingSegment)).describe('消息段列表'),
  friend: z.lazy(() => FriendEntity).describe('好友信息'),
}).describe('好友消息');
export type IncomingFriendMessage = z.infer<typeof IncomingFriendMessage>;

export const IncomingGroupMessage = z.object({
  message_scene: z.literal('group'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  sender_id: zUin.describe('发送者 QQ 号'),
  time: z.number().int().nonnegative().describe('消息 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => IncomingSegment)).describe('消息段列表'),
  group: z.lazy(() => GroupEntity).describe('群信息'),
  group_member: z.lazy(() => GroupMemberEntity).describe('群成员信息'),
}).describe('群消息');
export type IncomingGroupMessage = z.infer<typeof IncomingGroupMessage>;

export const IncomingTempMessage = z.object({
  message_scene: z.literal('temp'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  sender_id: zUin.describe('发送者 QQ 号'),
  time: z.number().int().nonnegative().describe('消息 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => IncomingSegment)).describe('消息段列表'),
  group: z.lazy(() => GroupEntity).nullish().describe('临时会话发送者的所在的群信息'),
}).describe('临时会话消息');
export type IncomingTempMessage = z.infer<typeof IncomingTempMessage>;

export const IncomingMessage = z.discriminatedUnion('message_scene', [
  IncomingFriendMessage,
  IncomingGroupMessage,
  IncomingTempMessage,
]).describe('接收消息');
export type IncomingMessage = z.infer<typeof IncomingMessage>;

export const IncomingForwardedMessage = z.object({
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  sender_name: z.string().describe('发送者名称'),
  avatar_url: z.string().describe('发送者头像 URL'),
  time: z.number().int().nonnegative().describe('消息 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => IncomingSegment)).describe('消息段列表'),
}).describe('接收转发消息');
export type IncomingForwardedMessage = z.infer<typeof IncomingForwardedMessage>;

export const GroupEssenceMessage = z.object({
  group_id: zUin.describe('群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  message_time: z.number().int().nonnegative().describe('消息发送时的 Unix 时间戳（秒）'),
  sender_id: zUin.describe('发送者 QQ 号'),
  sender_name: z.string().describe('发送者名称'),
  operator_id: zUin.describe('设置精华的操作者 QQ 号'),
  operator_name: z.string().describe('设置精华的操作者名称'),
  operation_time: z.number().int().nonnegative().describe('消息被设置精华时的 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => IncomingSegment)).describe('消息段列表'),
}).describe('群精华消息');
export type GroupEssenceMessage = z.infer<typeof GroupEssenceMessage>;

export const IncomingTextSegmentData = z.object({
  text: z.string().describe('文本内容'),
}).describe('文本消息段');
export type IncomingTextSegmentData = z.infer<typeof IncomingTextSegmentData>;

export const IncomingMentionSegmentData = z.object({
  user_id: zUin.describe('提及的 QQ 号'),
  name: z.string().describe('去掉 `@` 前缀的提及的名称'),
}).describe('提及消息段');
export type IncomingMentionSegmentData = z.infer<typeof IncomingMentionSegmentData>;

export const IncomingMentionAllSegmentData = z.object({
}).describe('提及全体消息段');
export type IncomingMentionAllSegmentData = z.infer<typeof IncomingMentionAllSegmentData>;

export const IncomingFaceSegmentData = z.object({
  face_id: z.string().describe('表情 ID'),
  is_large: z.boolean().describe('是否为超级表情'),
}).describe('表情消息段');
export type IncomingFaceSegmentData = z.infer<typeof IncomingFaceSegmentData>;

export const IncomingReplySegmentData = z.object({
  message_seq: z.number().int().nonnegative().describe('被引用的消息序列号'),
  sender_id: zUin.describe('被引用的消息发送者 QQ 号'),
  sender_name: z.string().nullish().describe('被引用的消息发送者名称，仅在合并转发中能够获取'),
  time: z.number().int().nonnegative().describe('被引用的消息的 Unix 时间戳（秒）'),
  get segments() {
    return z.array(z.lazy(() => IncomingSegment)).describe('回复消息内容');
  },
}).describe('回复消息段');
export type IncomingReplySegmentData = z.infer<typeof IncomingReplySegmentData>;

export const IncomingImageSegmentData = z.object({
  resource_id: z.string().describe('资源 ID'),
  temp_url: z.string().describe('临时 URL'),
  width: z.number().int().nonnegative().describe('图片宽度'),
  height: z.number().int().nonnegative().describe('图片高度'),
  summary: z.string().describe('图片预览文本'),
  sub_type: z.enum(['normal', 'sticker']).describe('图片类型'),
}).describe('图片消息段');
export type IncomingImageSegmentData = z.infer<typeof IncomingImageSegmentData>;

export const IncomingRecordSegmentData = z.object({
  resource_id: z.string().describe('资源 ID'),
  temp_url: z.string().describe('临时 URL'),
  duration: z.number().int().nonnegative().describe('语音时长（秒）'),
}).describe('语音消息段');
export type IncomingRecordSegmentData = z.infer<typeof IncomingRecordSegmentData>;

export const IncomingVideoSegmentData = z.object({
  resource_id: z.string().describe('资源 ID'),
  temp_url: z.string().describe('临时 URL'),
  width: z.number().int().nonnegative().describe('视频宽度'),
  height: z.number().int().nonnegative().describe('视频高度'),
  duration: z.number().int().nonnegative().describe('视频时长（秒）'),
}).describe('视频消息段');
export type IncomingVideoSegmentData = z.infer<typeof IncomingVideoSegmentData>;

export const IncomingFileSegmentData = z.object({
  file_id: z.string().describe('文件 ID'),
  file_name: z.string().describe('文件名称'),
  file_size: z.number().int().nonnegative().describe('文件大小（字节）'),
  file_hash: z.string().nullish().describe('文件的 TriSHA1 哈希值，仅在私聊文件中存在'),
}).describe('文件消息段');
export type IncomingFileSegmentData = z.infer<typeof IncomingFileSegmentData>;

export const IncomingForwardSegmentData = z.object({
  forward_id: z.string().describe('合并转发 ID'),
  title: z.string().describe('合并转发标题'),
  preview: z.array(z.string()).describe('合并转发预览文本'),
  summary: z.string().describe('合并转发摘要'),
}).describe('合并转发消息段');
export type IncomingForwardSegmentData = z.infer<typeof IncomingForwardSegmentData>;

export const IncomingMarketFaceSegmentData = z.object({
  emoji_package_id: z.number().int().nonnegative().describe('市场表情包 ID'),
  emoji_id: z.string().describe('市场表情 ID'),
  key: z.string().describe('市场表情 Key'),
  summary: z.string().describe('市场表情预览文本'),
  url: z.string().describe('市场表情 URL'),
}).describe('市场表情消息段');
export type IncomingMarketFaceSegmentData = z.infer<typeof IncomingMarketFaceSegmentData>;

export const IncomingLightAppSegmentData = z.object({
  app_name: z.string().describe('小程序名称'),
  json_payload: z.string().describe('小程序 JSON 数据'),
}).describe('小程序消息段');
export type IncomingLightAppSegmentData = z.infer<typeof IncomingLightAppSegmentData>;

export const IncomingXmlSegmentData = z.object({
  service_id: z.number().int().nonnegative().describe('服务 ID'),
  xml_payload: z.string().describe('XML 数据'),
}).describe('XML 消息段');
export type IncomingXmlSegmentData = z.infer<typeof IncomingXmlSegmentData>;

export const IncomingMarkdownSegmentData = z.object({
  content: z.string().describe('Markdown 内容'),
}).describe('Markdown 消息段');
export type IncomingMarkdownSegmentData = z.infer<typeof IncomingMarkdownSegmentData>;

export const IncomingSegment = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    data: IncomingTextSegmentData.describe('文本消息段'),
  }).describe('文本消息段'),

  z.object({
    type: z.literal('mention'),
    data: IncomingMentionSegmentData.describe('提及消息段'),
  }).describe('提及消息段'),

  z.object({
    type: z.literal('mention_all'),
    data: IncomingMentionAllSegmentData.describe('提及全体消息段'),
  }).describe('提及全体消息段'),

  z.object({
    type: z.literal('face'),
    data: IncomingFaceSegmentData.describe('表情消息段'),
  }).describe('表情消息段'),

  z.object({
    type: z.literal('reply'),
    data: IncomingReplySegmentData.describe('回复消息段'),
  }).describe('回复消息段'),

  z.object({
    type: z.literal('image'),
    data: IncomingImageSegmentData.describe('图片消息段'),
  }).describe('图片消息段'),

  z.object({
    type: z.literal('record'),
    data: IncomingRecordSegmentData.describe('语音消息段'),
  }).describe('语音消息段'),

  z.object({
    type: z.literal('video'),
    data: IncomingVideoSegmentData.describe('视频消息段'),
  }).describe('视频消息段'),

  z.object({
    type: z.literal('file'),
    data: IncomingFileSegmentData.describe('文件消息段'),
  }).describe('文件消息段'),

  z.object({
    type: z.literal('forward'),
    data: IncomingForwardSegmentData.describe('合并转发消息段'),
  }).describe('合并转发消息段'),

  z.object({
    type: z.literal('market_face'),
    data: IncomingMarketFaceSegmentData.describe('市场表情消息段'),
  }).describe('市场表情消息段'),

  z.object({
    type: z.literal('light_app'),
    data: IncomingLightAppSegmentData.describe('小程序消息段'),
  }).describe('小程序消息段'),

  z.object({
    type: z.literal('xml'),
    data: IncomingXmlSegmentData.describe('XML 消息段'),
  }).describe('XML 消息段'),

  z.object({
    type: z.literal('markdown'),
    data: IncomingMarkdownSegmentData.describe('Markdown 消息段'),
  }).describe('Markdown 消息段'),
]).catch({
  type: 'text',
  data: { text: '[unknown]' },
}).describe('接收消息段');
export type IncomingSegment = z.infer<typeof IncomingSegment>;

export const OutgoingForwardedMessage = z.object({
  user_id: zUin.describe('发送者 QQ 号'),
  sender_name: z.string().describe('发送者名称'),
  time: z.number().int().nonnegative().nullish().describe('消息 Unix 时间戳（秒）'),
  segments: z.array(z.lazy(() => OutgoingSegment)).describe('消息段列表'),
}).describe('发送转发消息');
export type OutgoingForwardedMessage = z.infer<typeof OutgoingForwardedMessage>;

export const OutgoingTextSegmentData = z.object({
  text: z.string().describe('文本内容'),
}).describe('文本消息段');
export type OutgoingTextSegmentData = z.infer<typeof OutgoingTextSegmentData>;

export const OutgoingMentionSegmentData = z.object({
  user_id: zUin.describe('提及的 QQ 号'),
}).describe('提及消息段');
export type OutgoingMentionSegmentData = z.infer<typeof OutgoingMentionSegmentData>;

export const OutgoingMentionAllSegmentData = z.object({
}).describe('提及全体消息段');
export type OutgoingMentionAllSegmentData = z.infer<typeof OutgoingMentionAllSegmentData>;

export const OutgoingFaceSegmentData = z.object({
  face_id: z.string().describe('表情 ID'),
  is_large: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否为超级表情'),
}).describe('表情消息段');
export type OutgoingFaceSegmentData = z.infer<typeof OutgoingFaceSegmentData>;

export const OutgoingReplySegmentData = z.object({
  message_seq: z.number().int().nonnegative().describe('被引用的消息序列号'),
}).describe('回复消息段');
export type OutgoingReplySegmentData = z.infer<typeof OutgoingReplySegmentData>;

export const OutgoingImageSegmentData = z.object({
  uri: z.string().describe('文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
  sub_type: z.enum(['normal', 'sticker']).nullish().default('normal').transform<'normal' | 'sticker'>((val) => val ?? 'normal').describe('图片类型'),
  summary: z.string().nullish().describe('图片预览文本'),
}).describe('图片消息段');
export type OutgoingImageSegmentData = z.infer<typeof OutgoingImageSegmentData>;

export const OutgoingRecordSegmentData = z.object({
  uri: z.string().describe('文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
}).describe('语音消息段');
export type OutgoingRecordSegmentData = z.infer<typeof OutgoingRecordSegmentData>;

export const OutgoingVideoSegmentData = z.object({
  uri: z.string().describe('文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
  thumb_uri: z.string().nullish().describe('封面图片 URI'),
}).describe('视频消息段');
export type OutgoingVideoSegmentData = z.infer<typeof OutgoingVideoSegmentData>;

export const OutgoingForwardSegmentData = z.object({
  get messages() {
    return z.array(z.lazy(() => OutgoingForwardedMessage)).describe('转发消息内容');
  },
  title: z.string().nullish().describe('合并转发标题'),
  preview: z.array(z.string()).nullish().describe('合并转发预览文本，若提供，至少 1 条，至多 4 条'),
  summary: z.string().nullish().describe('合并转发摘要'),
  prompt: z.string().nullish().describe('合并转发的预览外显文本，仅对移动端 QQ 有效'),
}).describe('合并转发消息段');
export type OutgoingForwardSegmentData = z.infer<typeof OutgoingForwardSegmentData>;

export const OutgoingLightAppSegmentData = z.object({
  json_payload: z.string().describe('小程序 JSON 数据'),
}).describe('小程序消息段');
export type OutgoingLightAppSegmentData = z.infer<typeof OutgoingLightAppSegmentData>;

export const OutgoingSegment = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    data: OutgoingTextSegmentData.describe('文本消息段'),
  }).describe('文本消息段'),

  z.object({
    type: z.literal('mention'),
    data: OutgoingMentionSegmentData.describe('提及消息段'),
  }).describe('提及消息段'),

  z.object({
    type: z.literal('mention_all'),
    data: OutgoingMentionAllSegmentData.describe('提及全体消息段'),
  }).describe('提及全体消息段'),

  z.object({
    type: z.literal('face'),
    data: OutgoingFaceSegmentData.describe('表情消息段'),
  }).describe('表情消息段'),

  z.object({
    type: z.literal('reply'),
    data: OutgoingReplySegmentData.describe('回复消息段'),
  }).describe('回复消息段'),

  z.object({
    type: z.literal('image'),
    data: OutgoingImageSegmentData.describe('图片消息段'),
  }).describe('图片消息段'),

  z.object({
    type: z.literal('record'),
    data: OutgoingRecordSegmentData.describe('语音消息段'),
  }).describe('语音消息段'),

  z.object({
    type: z.literal('video'),
    data: OutgoingVideoSegmentData.describe('视频消息段'),
  }).describe('视频消息段'),

  z.object({
    type: z.literal('forward'),
    data: OutgoingForwardSegmentData.describe('合并转发消息段'),
  }).describe('合并转发消息段'),

  z.object({
    type: z.literal('light_app'),
    data: OutgoingLightAppSegmentData.describe('小程序消息段'),
  }).describe('小程序消息段'),
]).describe('发送消息段');
export type OutgoingSegment = z.infer<typeof OutgoingSegment>;

// ####################################
// API Structs
// ####################################

export const GetLoginInfoOutput = z.object({
  uin: zUin.describe('登录 QQ 号'),
  nickname: z.string().describe('登录昵称'),
}).describe('get_login_info 响应数据');
export type GetLoginInfoOutput = z.output<typeof GetLoginInfoOutput>;

export const GetImplInfoOutput = z.object({
  impl_name: z.string().describe('协议端名称'),
  impl_version: z.string().describe('协议端版本'),
  qq_protocol_version: z.string().describe('协议端使用的 QQ 协议版本'),
  qq_protocol_type: z.enum(['windows', 'linux', 'macos', 'android_pad', 'android_phone', 'ipad', 'iphone', 'harmony', 'watch']).describe('协议端使用的 QQ 协议平台'),
  milky_version: z.string().describe('协议端实现的 Milky 协议版本，目前为 "1.2"'),
}).describe('get_impl_info 响应数据');
export type GetImplInfoOutput = z.output<typeof GetImplInfoOutput>;

export const GetUserProfileInput = z.object({
  user_id: zUin.describe('用户 QQ 号'),
}).describe('get_user_profile 请求参数');
export type GetUserProfileInput = z.input<typeof GetUserProfileInput>;

export const GetUserProfileOutput = z.object({
  nickname: z.string().describe('昵称'),
  qid: z.string().describe('QID'),
  age: z.number().int().nonnegative().describe('年龄'),
  sex: z.enum(['male', 'female', 'unknown']).describe('性别'),
  remark: z.string().describe('备注'),
  bio: z.string().describe('个性签名'),
  level: z.number().int().nonnegative().describe('QQ 等级'),
  country: z.string().describe('国家或地区'),
  city: z.string().describe('城市'),
  school: z.string().describe('学校'),
}).describe('get_user_profile 响应数据');
export type GetUserProfileOutput = z.output<typeof GetUserProfileOutput>;

export const GetFriendListInput = z.object({
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_friend_list 请求参数');
export type GetFriendListInput = z.input<typeof GetFriendListInput>;

export const GetFriendListOutput = z.object({
  friends: z.array(z.lazy(() => FriendEntity)).describe('好友列表'),
}).describe('get_friend_list 响应数据');
export type GetFriendListOutput = z.output<typeof GetFriendListOutput>;

export const GetFriendInfoInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_friend_info 请求参数');
export type GetFriendInfoInput = z.input<typeof GetFriendInfoInput>;

export const GetFriendInfoOutput = z.object({
  friend: z.lazy(() => FriendEntity).describe('好友信息'),
}).describe('get_friend_info 响应数据');
export type GetFriendInfoOutput = z.output<typeof GetFriendInfoOutput>;

export const GetGroupListInput = z.object({
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_group_list 请求参数');
export type GetGroupListInput = z.input<typeof GetGroupListInput>;

export const GetGroupListOutput = z.object({
  groups: z.array(z.lazy(() => GroupEntity)).describe('群列表'),
}).describe('get_group_list 响应数据');
export type GetGroupListOutput = z.output<typeof GetGroupListOutput>;

export const GetGroupInfoInput = z.object({
  group_id: zUin.describe('群号'),
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_group_info 请求参数');
export type GetGroupInfoInput = z.input<typeof GetGroupInfoInput>;

export const GetGroupInfoOutput = z.object({
  group: z.lazy(() => GroupEntity).describe('群信息'),
}).describe('get_group_info 响应数据');
export type GetGroupInfoOutput = z.output<typeof GetGroupInfoOutput>;

export const GetGroupMemberListInput = z.object({
  group_id: zUin.describe('群号'),
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_group_member_list 请求参数');
export type GetGroupMemberListInput = z.input<typeof GetGroupMemberListInput>;

export const GetGroupMemberListOutput = z.object({
  members: z.array(z.lazy(() => GroupMemberEntity)).describe('群成员列表'),
}).describe('get_group_member_list 响应数据');
export type GetGroupMemberListOutput = z.output<typeof GetGroupMemberListOutput>;

export const GetGroupMemberInfoInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('群成员 QQ 号'),
  no_cache: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否强制不使用缓存'),
}).describe('get_group_member_info 请求参数');
export type GetGroupMemberInfoInput = z.input<typeof GetGroupMemberInfoInput>;

export const GetGroupMemberInfoOutput = z.object({
  member: z.lazy(() => GroupMemberEntity).describe('群成员信息'),
}).describe('get_group_member_info 响应数据');
export type GetGroupMemberInfoOutput = z.output<typeof GetGroupMemberInfoOutput>;

export const GetPeerPinsOutput = z.object({
  friends: z.array(z.lazy(() => FriendEntity)).describe('置顶的好友列表'),
  groups: z.array(z.lazy(() => GroupEntity)).describe('置顶的群列表'),
}).describe('get_peer_pins 响应数据');
export type GetPeerPinsOutput = z.output<typeof GetPeerPinsOutput>;

export const SetPeerPinInput = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('要设置的会话的消息场景'),
  peer_id: zUin.describe('要设置的好友 QQ 号或群号'),
  is_pinned: z.boolean().nullish().default(true).transform<boolean>((val) => val ?? true).describe('是否置顶, `false` 表示取消置顶'),
}).describe('set_peer_pin 请求参数');
export type SetPeerPinInput = z.input<typeof SetPeerPinInput>;

export const SetAvatarInput = z.object({
  uri: z.string().describe('头像文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
}).describe('set_avatar 请求参数');
export type SetAvatarInput = z.input<typeof SetAvatarInput>;

export const SetNicknameInput = z.object({
  new_nickname: z.string().describe('新昵称'),
}).describe('set_nickname 请求参数');
export type SetNicknameInput = z.input<typeof SetNicknameInput>;

export const SetBioInput = z.object({
  new_bio: z.string().describe('新个性签名'),
}).describe('set_bio 请求参数');
export type SetBioInput = z.input<typeof SetBioInput>;

export const GetCustomFaceUrlListOutput = z.object({
  urls: z.array(z.string()).describe('自定义表情 URL 列表'),
}).describe('get_custom_face_url_list 响应数据');
export type GetCustomFaceUrlListOutput = z.output<typeof GetCustomFaceUrlListOutput>;

export const GetCookiesInput = z.object({
  domain: z.string().describe('需要获取 Cookies 的域名'),
}).describe('get_cookies 请求参数');
export type GetCookiesInput = z.input<typeof GetCookiesInput>;

export const GetCookiesOutput = z.object({
  cookies: z.string().describe('域名对应的 Cookies 字符串'),
}).describe('get_cookies 响应数据');
export type GetCookiesOutput = z.output<typeof GetCookiesOutput>;

export const GetCSRFTokenOutput = z.object({
  csrf_token: z.string().describe('CSRF Token'),
}).describe('get_csrf_token 响应数据');
export type GetCSRFTokenOutput = z.output<typeof GetCSRFTokenOutput>;

export const SendPrivateMessageInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  message: z.array(z.lazy(() => OutgoingSegment)).describe('消息内容'),
}).describe('send_private_message 请求参数');
export type SendPrivateMessageInput = z.input<typeof SendPrivateMessageInput>;

export const SendPrivateMessageOutput = z.object({
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  time: z.number().int().nonnegative().describe('消息发送时间'),
}).describe('send_private_message 响应数据');
export type SendPrivateMessageOutput = z.output<typeof SendPrivateMessageOutput>;

export const SendGroupMessageInput = z.object({
  group_id: zUin.describe('群号'),
  message: z.array(z.lazy(() => OutgoingSegment)).describe('消息内容'),
}).describe('send_group_message 请求参数');
export type SendGroupMessageInput = z.input<typeof SendGroupMessageInput>;

export const SendGroupMessageOutput = z.object({
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  time: z.number().int().nonnegative().describe('消息发送时间'),
}).describe('send_group_message 响应数据');
export type SendGroupMessageOutput = z.output<typeof SendGroupMessageOutput>;

export const RecallPrivateMessageInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
}).describe('recall_private_message 请求参数');
export type RecallPrivateMessageInput = z.input<typeof RecallPrivateMessageInput>;

export const RecallGroupMessageInput = z.object({
  group_id: zUin.describe('群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
}).describe('recall_group_message 请求参数');
export type RecallGroupMessageInput = z.input<typeof RecallGroupMessageInput>;

export const GetMessageInput = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('消息场景'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
}).describe('get_message 请求参数');
export type GetMessageInput = z.input<typeof GetMessageInput>;

export const GetMessageOutput = z.object({
  message: z.lazy(() => IncomingMessage).describe('消息内容'),
}).describe('get_message 响应数据');
export type GetMessageOutput = z.output<typeof GetMessageOutput>;

export const GetHistoryMessagesInput = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('消息场景'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  start_message_seq: z.number().int().nonnegative().nullish().describe('起始消息序列号，由此开始从新到旧查询，不提供则从最新消息开始'),
  limit: z.number().int().nonnegative().nullish().default(20).transform<number>((val) => val ?? 20).describe('期望获取到的消息数量，最多 30 条'),
}).describe('get_history_messages 请求参数');
export type GetHistoryMessagesInput = z.input<typeof GetHistoryMessagesInput>;

export const GetHistoryMessagesOutput = z.object({
  messages: z.array(z.lazy(() => IncomingMessage)).describe('获取到的消息（message_seq 升序排列），部分消息可能不存在，如撤回的消息'),
  next_message_seq: z.number().int().nonnegative().nullish().describe('下一页起始消息序列号'),
}).describe('get_history_messages 响应数据');
export type GetHistoryMessagesOutput = z.output<typeof GetHistoryMessagesOutput>;

export const GetResourceTempUrlInput = z.object({
  resource_id: z.string().describe('资源 ID'),
}).describe('get_resource_temp_url 请求参数');
export type GetResourceTempUrlInput = z.input<typeof GetResourceTempUrlInput>;

export const GetResourceTempUrlOutput = z.object({
  url: z.string().describe('临时资源链接'),
}).describe('get_resource_temp_url 响应数据');
export type GetResourceTempUrlOutput = z.output<typeof GetResourceTempUrlOutput>;

export const GetForwardedMessagesInput = z.object({
  forward_id: z.string().describe('转发消息 ID'),
}).describe('get_forwarded_messages 请求参数');
export type GetForwardedMessagesInput = z.input<typeof GetForwardedMessagesInput>;

export const GetForwardedMessagesOutput = z.object({
  messages: z.array(z.lazy(() => IncomingForwardedMessage)).describe('转发消息内容'),
}).describe('get_forwarded_messages 响应数据');
export type GetForwardedMessagesOutput = z.output<typeof GetForwardedMessagesOutput>;

export const MarkMessageAsReadInput = z.object({
  message_scene: z.enum(['friend', 'group', 'temp']).describe('消息场景'),
  peer_id: zUin.describe('好友 QQ 号或群号'),
  message_seq: z.number().int().nonnegative().describe('标为已读的消息序列号，该消息及更早的消息将被标记为已读'),
}).describe('mark_message_as_read 请求参数');
export type MarkMessageAsReadInput = z.input<typeof MarkMessageAsReadInput>;

export const SendFriendNudgeInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  is_self: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否戳自己'),
}).describe('send_friend_nudge 请求参数');
export type SendFriendNudgeInput = z.input<typeof SendFriendNudgeInput>;

export const SendProfileLikeInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  count: z.number().int().nonnegative().nullish().default(1).transform<number>((val) => val ?? 1).describe('点赞数量'),
}).describe('send_profile_like 请求参数');
export type SendProfileLikeInput = z.input<typeof SendProfileLikeInput>;

export const DeleteFriendInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
}).describe('delete_friend 请求参数');
export type DeleteFriendInput = z.input<typeof DeleteFriendInput>;

export const GetFriendRequestsInput = z.object({
  limit: z.number().int().nonnegative().nullish().default(20).transform<number>((val) => val ?? 20).describe('获取的最大请求数量'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('`true` 表示只获取被过滤（由风险账号发起）的通知，`false` 表示只获取未被过滤的通知'),
}).describe('get_friend_requests 请求参数');
export type GetFriendRequestsInput = z.input<typeof GetFriendRequestsInput>;

export const GetFriendRequestsOutput = z.object({
  requests: z.array(z.lazy(() => FriendRequest)).describe('好友请求列表'),
}).describe('get_friend_requests 响应数据');
export type GetFriendRequestsOutput = z.output<typeof GetFriendRequestsOutput>;

export const AcceptFriendRequestInput = z.object({
  initiator_uid: z.string().describe('请求发起者 UID'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否是被过滤的请求'),
}).describe('accept_friend_request 请求参数');
export type AcceptFriendRequestInput = z.input<typeof AcceptFriendRequestInput>;

export const RejectFriendRequestInput = z.object({
  initiator_uid: z.string().describe('请求发起者 UID'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否是被过滤的请求'),
  reason: z.string().nullish().describe('拒绝理由'),
}).describe('reject_friend_request 请求参数');
export type RejectFriendRequestInput = z.input<typeof RejectFriendRequestInput>;

export const SetGroupNameInput = z.object({
  group_id: zUin.describe('群号'),
  new_group_name: z.string().describe('新群名称'),
}).describe('set_group_name 请求参数');
export type SetGroupNameInput = z.input<typeof SetGroupNameInput>;

export const SetGroupAvatarInput = z.object({
  group_id: zUin.describe('群号'),
  image_uri: z.string().describe('头像文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
}).describe('set_group_avatar 请求参数');
export type SetGroupAvatarInput = z.input<typeof SetGroupAvatarInput>;

export const SetGroupMemberCardInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被设置的群成员 QQ 号'),
  card: z.string().describe('新群名片'),
}).describe('set_group_member_card 请求参数');
export type SetGroupMemberCardInput = z.input<typeof SetGroupMemberCardInput>;

export const SetGroupMemberSpecialTitleInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被设置的群成员 QQ 号'),
  special_title: z.string().describe('新专属头衔'),
}).describe('set_group_member_special_title 请求参数');
export type SetGroupMemberSpecialTitleInput = z.input<typeof SetGroupMemberSpecialTitleInput>;

export const SetGroupMemberAdminInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被设置的 QQ 号'),
  is_set: z.boolean().nullish().default(true).transform<boolean>((val) => val ?? true).describe('是否设置为管理员，`false` 表示取消管理员'),
}).describe('set_group_member_admin 请求参数');
export type SetGroupMemberAdminInput = z.input<typeof SetGroupMemberAdminInput>;

export const SetGroupMemberMuteInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被设置的 QQ 号'),
  duration: z.number().int().nonnegative().nullish().default(0).transform<number>((val) => val ?? 0).describe('禁言持续时间（秒），设为 `0` 为取消禁言'),
}).describe('set_group_member_mute 请求参数');
export type SetGroupMemberMuteInput = z.input<typeof SetGroupMemberMuteInput>;

export const SetGroupWholeMuteInput = z.object({
  group_id: zUin.describe('群号'),
  is_mute: z.boolean().nullish().default(true).transform<boolean>((val) => val ?? true).describe('是否开启全员禁言，`false` 表示取消全员禁言'),
}).describe('set_group_whole_mute 请求参数');
export type SetGroupWholeMuteInput = z.input<typeof SetGroupWholeMuteInput>;

export const KickGroupMemberInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被踢的 QQ 号'),
  reject_add_request: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否拒绝加群申请，`false` 表示不拒绝'),
}).describe('kick_group_member 请求参数');
export type KickGroupMemberInput = z.input<typeof KickGroupMemberInput>;

export const GetGroupAnnouncementsInput = z.object({
  group_id: zUin.describe('群号'),
}).describe('get_group_announcements 请求参数');
export type GetGroupAnnouncementsInput = z.input<typeof GetGroupAnnouncementsInput>;

export const GetGroupAnnouncementsOutput = z.object({
  announcements: z.array(z.lazy(() => GroupAnnouncementEntity)).describe('群公告列表'),
}).describe('get_group_announcements 响应数据');
export type GetGroupAnnouncementsOutput = z.output<typeof GetGroupAnnouncementsOutput>;

export const SendGroupAnnouncementInput = z.object({
  group_id: zUin.describe('群号'),
  content: z.string().describe('公告内容'),
  image_uri: z.string().nullish().describe('公告附带图像文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
}).describe('send_group_announcement 请求参数');
export type SendGroupAnnouncementInput = z.input<typeof SendGroupAnnouncementInput>;

export const DeleteGroupAnnouncementInput = z.object({
  group_id: zUin.describe('群号'),
  announcement_id: z.string().describe('公告 ID'),
}).describe('delete_group_announcement 请求参数');
export type DeleteGroupAnnouncementInput = z.input<typeof DeleteGroupAnnouncementInput>;

export const GetGroupEssenceMessagesInput = z.object({
  group_id: zUin.describe('群号'),
  page_index: z.number().int().nonnegative().describe('页码索引，从 0 开始'),
  page_size: z.number().int().nonnegative().describe('每页包含的精华消息数量'),
}).describe('get_group_essence_messages 请求参数');
export type GetGroupEssenceMessagesInput = z.input<typeof GetGroupEssenceMessagesInput>;

export const GetGroupEssenceMessagesOutput = z.object({
  messages: z.array(z.lazy(() => GroupEssenceMessage)).describe('精华消息列表'),
  is_end: z.boolean().describe('是否已到最后一页'),
}).describe('get_group_essence_messages 响应数据');
export type GetGroupEssenceMessagesOutput = z.output<typeof GetGroupEssenceMessagesOutput>;

export const SetGroupEssenceMessageInput = z.object({
  group_id: zUin.describe('群号'),
  message_seq: z.number().int().nonnegative().describe('消息序列号'),
  is_set: z.boolean().nullish().default(true).transform<boolean>((val) => val ?? true).describe('是否设置为精华消息，`false` 表示取消精华'),
}).describe('set_group_essence_message 请求参数');
export type SetGroupEssenceMessageInput = z.input<typeof SetGroupEssenceMessageInput>;

export const QuitGroupInput = z.object({
  group_id: zUin.describe('群号'),
}).describe('quit_group 请求参数');
export type QuitGroupInput = z.input<typeof QuitGroupInput>;

export const SendGroupMessageReactionInput = z.object({
  group_id: zUin.describe('群号'),
  message_seq: z.number().int().nonnegative().describe('要回应的消息序列号'),
  reaction: z.string().describe('发送的回应的表情 ID'),
  reaction_type: z.enum(['face', 'emoji']).nullish().default('face').transform<'face' | 'emoji'>((val) => val ?? 'face').describe('发送的回应类型'),
  is_add: z.boolean().nullish().default(true).transform<boolean>((val) => val ?? true).describe('是否添加表情，`false` 表示取消'),
}).describe('send_group_message_reaction 请求参数');
export type SendGroupMessageReactionInput = z.input<typeof SendGroupMessageReactionInput>;

export const SendGroupNudgeInput = z.object({
  group_id: zUin.describe('群号'),
  user_id: zUin.describe('被戳的群成员 QQ 号'),
}).describe('send_group_nudge 请求参数');
export type SendGroupNudgeInput = z.input<typeof SendGroupNudgeInput>;

export const GetGroupNotificationsInput = z.object({
  start_notification_seq: z.number().int().nonnegative().nullish().describe('起始通知序列号'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('`true` 表示只获取被过滤（由风险账号发起）的通知，`false` 表示只获取未被过滤的通知'),
  limit: z.number().int().nonnegative().nullish().default(20).transform<number>((val) => val ?? 20).describe('获取的最大通知数量'),
}).describe('get_group_notifications 请求参数');
export type GetGroupNotificationsInput = z.input<typeof GetGroupNotificationsInput>;

export const GetGroupNotificationsOutput = z.object({
  notifications: zDropBadElementArray(GroupNotification).describe('获取到的群通知（notification_seq 降序排列），序列号不一定连续'),
  next_notification_seq: z.number().int().nonnegative().nullish().describe('下一页起始通知序列号'),
}).describe('get_group_notifications 响应数据');
export type GetGroupNotificationsOutput = z.output<typeof GetGroupNotificationsOutput>;

export const AcceptGroupRequestInput = z.object({
  notification_seq: z.number().int().nonnegative().describe('请求对应的通知序列号'),
  notification_type: z.enum(['join_request', 'invited_join_request']).describe('请求对应的通知类型'),
  group_id: zUin.describe('请求所在的群号'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否是被过滤的请求'),
}).describe('accept_group_request 请求参数');
export type AcceptGroupRequestInput = z.input<typeof AcceptGroupRequestInput>;

export const RejectGroupRequestInput = z.object({
  notification_seq: z.number().int().nonnegative().describe('请求对应的通知序列号'),
  notification_type: z.enum(['join_request', 'invited_join_request']).describe('请求对应的通知类型'),
  group_id: zUin.describe('请求所在的群号'),
  is_filtered: z.boolean().nullish().default(false).transform<boolean>((val) => val ?? false).describe('是否是被过滤的请求'),
  reason: z.string().nullish().describe('拒绝理由'),
}).describe('reject_group_request 请求参数');
export type RejectGroupRequestInput = z.input<typeof RejectGroupRequestInput>;

export const AcceptGroupInvitationInput = z.object({
  group_id: zUin.describe('群号'),
  invitation_seq: z.number().int().nonnegative().describe('邀请序列号'),
}).describe('accept_group_invitation 请求参数');
export type AcceptGroupInvitationInput = z.input<typeof AcceptGroupInvitationInput>;

export const RejectGroupInvitationInput = z.object({
  group_id: zUin.describe('群号'),
  invitation_seq: z.number().int().nonnegative().describe('邀请序列号'),
}).describe('reject_group_invitation 请求参数');
export type RejectGroupInvitationInput = z.input<typeof RejectGroupInvitationInput>;

export const UploadPrivateFileInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  file_uri: z.string().describe('文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
  file_name: z.string().describe('文件名称'),
}).describe('upload_private_file 请求参数');
export type UploadPrivateFileInput = z.input<typeof UploadPrivateFileInput>;

export const UploadPrivateFileOutput = z.object({
  file_id: z.string().describe('文件 ID'),
}).describe('upload_private_file 响应数据');
export type UploadPrivateFileOutput = z.output<typeof UploadPrivateFileOutput>;

export const UploadGroupFileInput = z.object({
  group_id: zUin.describe('群号'),
  parent_folder_id: z.string().nullish().default('/').transform<string>((val) => val ?? '/').describe('目标文件夹 ID'),
  file_uri: z.string().describe('文件 URI，支持 `file://` `http(s)://` `base64://` 三种格式'),
  file_name: z.string().describe('文件名称'),
}).describe('upload_group_file 请求参数');
export type UploadGroupFileInput = z.input<typeof UploadGroupFileInput>;

export const UploadGroupFileOutput = z.object({
  file_id: z.string().describe('文件 ID'),
}).describe('upload_group_file 响应数据');
export type UploadGroupFileOutput = z.output<typeof UploadGroupFileOutput>;

export const GetPrivateFileDownloadUrlInput = z.object({
  user_id: zUin.describe('好友 QQ 号'),
  file_id: z.string().describe('文件 ID'),
  file_hash: z.string().describe('文件的 TriSHA1 哈希值'),
}).describe('get_private_file_download_url 请求参数');
export type GetPrivateFileDownloadUrlInput = z.input<typeof GetPrivateFileDownloadUrlInput>;

export const GetPrivateFileDownloadUrlOutput = z.object({
  download_url: z.string().describe('文件下载链接'),
}).describe('get_private_file_download_url 响应数据');
export type GetPrivateFileDownloadUrlOutput = z.output<typeof GetPrivateFileDownloadUrlOutput>;

export const GetGroupFileDownloadUrlInput = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
}).describe('get_group_file_download_url 请求参数');
export type GetGroupFileDownloadUrlInput = z.input<typeof GetGroupFileDownloadUrlInput>;

export const GetGroupFileDownloadUrlOutput = z.object({
  download_url: z.string().describe('文件下载链接'),
}).describe('get_group_file_download_url 响应数据');
export type GetGroupFileDownloadUrlOutput = z.output<typeof GetGroupFileDownloadUrlOutput>;

export const GetGroupFilesInput = z.object({
  group_id: zUin.describe('群号'),
  parent_folder_id: z.string().nullish().default('/').transform<string>((val) => val ?? '/').describe('父文件夹 ID'),
}).describe('get_group_files 请求参数');
export type GetGroupFilesInput = z.input<typeof GetGroupFilesInput>;

export const GetGroupFilesOutput = z.object({
  files: z.array(z.lazy(() => GroupFileEntity)).describe('文件列表'),
  folders: z.array(z.lazy(() => GroupFolderEntity)).describe('文件夹列表'),
}).describe('get_group_files 响应数据');
export type GetGroupFilesOutput = z.output<typeof GetGroupFilesOutput>;

export const MoveGroupFileInput = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
  parent_folder_id: z.string().nullish().default('/').transform<string>((val) => val ?? '/').describe('文件所在的文件夹 ID'),
  target_folder_id: z.string().nullish().default('/').transform<string>((val) => val ?? '/').describe('目标文件夹 ID'),
}).describe('move_group_file 请求参数');
export type MoveGroupFileInput = z.input<typeof MoveGroupFileInput>;

export const RenameGroupFileInput = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
  parent_folder_id: z.string().nullish().default('/').transform<string>((val) => val ?? '/').describe('文件所在的文件夹 ID'),
  new_file_name: z.string().describe('新文件名称'),
}).describe('rename_group_file 请求参数');
export type RenameGroupFileInput = z.input<typeof RenameGroupFileInput>;

export const DeleteGroupFileInput = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
}).describe('delete_group_file 请求参数');
export type DeleteGroupFileInput = z.input<typeof DeleteGroupFileInput>;

export const PersistGroupFileInput = z.object({
  group_id: zUin.describe('群号'),
  file_id: z.string().describe('文件 ID'),
}).describe('persist_group_file 请求参数');
export type PersistGroupFileInput = z.input<typeof PersistGroupFileInput>;

export const CreateGroupFolderInput = z.object({
  group_id: zUin.describe('群号'),
  folder_name: z.string().describe('文件夹名称'),
}).describe('create_group_folder 请求参数');
export type CreateGroupFolderInput = z.input<typeof CreateGroupFolderInput>;

export const CreateGroupFolderOutput = z.object({
  folder_id: z.string().describe('文件夹 ID'),
}).describe('create_group_folder 响应数据');
export type CreateGroupFolderOutput = z.output<typeof CreateGroupFolderOutput>;

export const RenameGroupFolderInput = z.object({
  group_id: zUin.describe('群号'),
  folder_id: z.string().describe('文件夹 ID'),
  new_folder_name: z.string().describe('新文件夹名'),
}).describe('rename_group_folder 请求参数');
export type RenameGroupFolderInput = z.input<typeof RenameGroupFolderInput>;

export const DeleteGroupFolderInput = z.object({
  group_id: zUin.describe('群号'),
  folder_id: z.string().describe('文件夹 ID'),
}).describe('delete_group_folder 请求参数');
export type DeleteGroupFolderInput = z.input<typeof DeleteGroupFolderInput>;

// ####################################
// Meta Information
// ####################################

export const zodCommonStructs = {
  Event,
  FriendEntity,
  FriendCategoryEntity,
  GroupEntity,
  GroupMemberEntity,
  GroupAnnouncementEntity,
  GroupFileEntity,
  GroupFolderEntity,
  FriendRequest,
  GroupNotification,
  IncomingMessage,
  IncomingForwardedMessage,
  GroupEssenceMessage,
  IncomingSegment,
  OutgoingForwardedMessage,
  OutgoingSegment,
};

export const zodApiCategories = {
  system: {
    name: '系统 API',
    apis: {
      get_login_info: {
        description: '获取登录信息',
        requestSchema: null,
        responseSchema: GetLoginInfoOutput,
      },
      get_impl_info: {
        description: '获取协议端信息',
        requestSchema: null,
        responseSchema: GetImplInfoOutput,
      },
      get_user_profile: {
        description: '获取用户个人信息',
        requestSchema: GetUserProfileInput,
        responseSchema: GetUserProfileOutput,
      },
      get_friend_list: {
        description: '获取好友列表',
        requestSchema: GetFriendListInput,
        responseSchema: GetFriendListOutput,
      },
      get_friend_info: {
        description: '获取好友信息',
        requestSchema: GetFriendInfoInput,
        responseSchema: GetFriendInfoOutput,
      },
      get_group_list: {
        description: '获取群列表',
        requestSchema: GetGroupListInput,
        responseSchema: GetGroupListOutput,
      },
      get_group_info: {
        description: '获取群信息',
        requestSchema: GetGroupInfoInput,
        responseSchema: GetGroupInfoOutput,
      },
      get_group_member_list: {
        description: '获取群成员列表',
        requestSchema: GetGroupMemberListInput,
        responseSchema: GetGroupMemberListOutput,
      },
      get_group_member_info: {
        description: '获取群成员信息',
        requestSchema: GetGroupMemberInfoInput,
        responseSchema: GetGroupMemberInfoOutput,
      },
      get_peer_pins: {
        description: '获取置顶的好友和群列表',
        requestSchema: null,
        responseSchema: GetPeerPinsOutput,
      },
      set_peer_pin: {
        description: '设置好友或群的置顶状态',
        requestSchema: SetPeerPinInput,
        responseSchema: null,
      },
      set_avatar: {
        description: '设置 QQ 账号头像',
        requestSchema: SetAvatarInput,
        responseSchema: null,
      },
      set_nickname: {
        description: '设置 QQ 账号昵称',
        requestSchema: SetNicknameInput,
        responseSchema: null,
      },
      set_bio: {
        description: '设置 QQ 账号个性签名',
        requestSchema: SetBioInput,
        responseSchema: null,
      },
      get_custom_face_url_list: {
        description: '获取自定义表情 URL 列表',
        requestSchema: null,
        responseSchema: GetCustomFaceUrlListOutput,
      },
      get_cookies: {
        description: '获取 Cookies',
        requestSchema: GetCookiesInput,
        responseSchema: GetCookiesOutput,
      },
      get_csrf_token: {
        description: '获取 CSRF Token',
        requestSchema: null,
        responseSchema: GetCSRFTokenOutput,
      },
    },
  },
  message: {
    name: '消息 API',
    apis: {
      send_private_message: {
        description: '发送私聊消息',
        requestSchema: SendPrivateMessageInput,
        responseSchema: SendPrivateMessageOutput,
      },
      send_group_message: {
        description: '发送群聊消息',
        requestSchema: SendGroupMessageInput,
        responseSchema: SendGroupMessageOutput,
      },
      recall_private_message: {
        description: '撤回私聊消息',
        requestSchema: RecallPrivateMessageInput,
        responseSchema: null,
      },
      recall_group_message: {
        description: '撤回群聊消息',
        requestSchema: RecallGroupMessageInput,
        responseSchema: null,
      },
      get_message: {
        description: '获取消息',
        requestSchema: GetMessageInput,
        responseSchema: GetMessageOutput,
      },
      get_history_messages: {
        description: '获取历史消息列表',
        requestSchema: GetHistoryMessagesInput,
        responseSchema: GetHistoryMessagesOutput,
      },
      get_resource_temp_url: {
        description: '获取临时资源链接',
        requestSchema: GetResourceTempUrlInput,
        responseSchema: GetResourceTempUrlOutput,
      },
      get_forwarded_messages: {
        description: '获取合并转发消息内容',
        requestSchema: GetForwardedMessagesInput,
        responseSchema: GetForwardedMessagesOutput,
      },
      mark_message_as_read: {
        description: '标记消息为已读',
        requestSchema: MarkMessageAsReadInput,
        responseSchema: null,
      },
    },
  },
  friend: {
    name: '好友 API',
    apis: {
      send_friend_nudge: {
        description: '发送好友戳一戳',
        requestSchema: SendFriendNudgeInput,
        responseSchema: null,
      },
      send_profile_like: {
        description: '发送名片点赞',
        requestSchema: SendProfileLikeInput,
        responseSchema: null,
      },
      delete_friend: {
        description: '删除好友',
        requestSchema: DeleteFriendInput,
        responseSchema: null,
      },
      get_friend_requests: {
        description: '获取好友请求列表',
        requestSchema: GetFriendRequestsInput,
        responseSchema: GetFriendRequestsOutput,
      },
      accept_friend_request: {
        description: '同意好友请求',
        requestSchema: AcceptFriendRequestInput,
        responseSchema: null,
      },
      reject_friend_request: {
        description: '拒绝好友请求',
        requestSchema: RejectFriendRequestInput,
        responseSchema: null,
      },
    },
  },
  group: {
    name: '群聊 API',
    apis: {
      set_group_name: {
        description: '设置群名称',
        requestSchema: SetGroupNameInput,
        responseSchema: null,
      },
      set_group_avatar: {
        description: '设置群头像',
        requestSchema: SetGroupAvatarInput,
        responseSchema: null,
      },
      set_group_member_card: {
        description: '设置群名片',
        requestSchema: SetGroupMemberCardInput,
        responseSchema: null,
      },
      set_group_member_special_title: {
        description: '设置群成员专属头衔',
        requestSchema: SetGroupMemberSpecialTitleInput,
        responseSchema: null,
      },
      set_group_member_admin: {
        description: '设置群管理员',
        requestSchema: SetGroupMemberAdminInput,
        responseSchema: null,
      },
      set_group_member_mute: {
        description: '设置群成员禁言',
        requestSchema: SetGroupMemberMuteInput,
        responseSchema: null,
      },
      set_group_whole_mute: {
        description: '设置群全员禁言',
        requestSchema: SetGroupWholeMuteInput,
        responseSchema: null,
      },
      kick_group_member: {
        description: '踢出群成员',
        requestSchema: KickGroupMemberInput,
        responseSchema: null,
      },
      get_group_announcements: {
        description: '获取群公告列表',
        requestSchema: GetGroupAnnouncementsInput,
        responseSchema: GetGroupAnnouncementsOutput,
      },
      send_group_announcement: {
        description: '发送群公告',
        requestSchema: SendGroupAnnouncementInput,
        responseSchema: null,
      },
      delete_group_announcement: {
        description: '删除群公告',
        requestSchema: DeleteGroupAnnouncementInput,
        responseSchema: null,
      },
      get_group_essence_messages: {
        description: '获取群精华消息列表',
        requestSchema: GetGroupEssenceMessagesInput,
        responseSchema: GetGroupEssenceMessagesOutput,
      },
      set_group_essence_message: {
        description: '设置群精华消息',
        requestSchema: SetGroupEssenceMessageInput,
        responseSchema: null,
      },
      quit_group: {
        description: '退出群',
        requestSchema: QuitGroupInput,
        responseSchema: null,
      },
      send_group_message_reaction: {
        description: '发送群消息表情回应',
        requestSchema: SendGroupMessageReactionInput,
        responseSchema: null,
      },
      send_group_nudge: {
        description: '发送群戳一戳',
        requestSchema: SendGroupNudgeInput,
        responseSchema: null,
      },
      get_group_notifications: {
        description: '获取群通知列表',
        requestSchema: GetGroupNotificationsInput,
        responseSchema: GetGroupNotificationsOutput,
      },
      accept_group_request: {
        description: '同意入群/邀请他人入群请求',
        requestSchema: AcceptGroupRequestInput,
        responseSchema: null,
      },
      reject_group_request: {
        description: '拒绝入群/邀请他人入群请求',
        requestSchema: RejectGroupRequestInput,
        responseSchema: null,
      },
      accept_group_invitation: {
        description: '同意他人邀请自身入群',
        requestSchema: AcceptGroupInvitationInput,
        responseSchema: null,
      },
      reject_group_invitation: {
        description: '拒绝他人邀请自身入群',
        requestSchema: RejectGroupInvitationInput,
        responseSchema: null,
      },
    },
  },
  file: {
    name: '文件 API',
    apis: {
      upload_private_file: {
        description: '上传私聊文件',
        requestSchema: UploadPrivateFileInput,
        responseSchema: UploadPrivateFileOutput,
      },
      upload_group_file: {
        description: '上传群文件',
        requestSchema: UploadGroupFileInput,
        responseSchema: UploadGroupFileOutput,
      },
      get_private_file_download_url: {
        description: '获取私聊文件下载链接',
        requestSchema: GetPrivateFileDownloadUrlInput,
        responseSchema: GetPrivateFileDownloadUrlOutput,
      },
      get_group_file_download_url: {
        description: '获取群文件下载链接',
        requestSchema: GetGroupFileDownloadUrlInput,
        responseSchema: GetGroupFileDownloadUrlOutput,
      },
      get_group_files: {
        description: '获取群文件列表',
        requestSchema: GetGroupFilesInput,
        responseSchema: GetGroupFilesOutput,
      },
      move_group_file: {
        description: '移动群文件',
        requestSchema: MoveGroupFileInput,
        responseSchema: null,
      },
      rename_group_file: {
        description: '重命名群文件',
        requestSchema: RenameGroupFileInput,
        responseSchema: null,
      },
      delete_group_file: {
        description: '删除群文件',
        requestSchema: DeleteGroupFileInput,
        responseSchema: null,
      },
      persist_group_file: {
        description: '转存群文件为永久文件',
        requestSchema: PersistGroupFileInput,
        responseSchema: null,
      },
      create_group_folder: {
        description: '创建群文件夹',
        requestSchema: CreateGroupFolderInput,
        responseSchema: CreateGroupFolderOutput,
      },
      rename_group_folder: {
        description: '重命名群文件夹',
        requestSchema: RenameGroupFolderInput,
        responseSchema: null,
      },
      delete_group_folder: {
        description: '删除群文件夹',
        requestSchema: DeleteGroupFolderInput,
        responseSchema: null,
      },
    },
  },
};
