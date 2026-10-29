// Payloads of the QQ open platform (bot.q.qq.com): just the fields the adapter reads

export const Opcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  Resume: 6,
  Reconnect: 7,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
} as const

export const Intents = {
  /** Guilds and their sub-channels created, changed, deleted */
  GUILDS: 1 << 0,
  /** Guild members joining, changing, leaving */
  GUILD_MEMBERS: 1 << 1,
  /** Every guild message (MESSAGE_CREATE / MESSAGE_DELETE); private bots only */
  GUILD_MESSAGES: 1 << 9,
  /** Reactions on guild messages */
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  /** Guild direct messages */
  DIRECT_MESSAGE: 1 << 12,
  /** Forum events of public bots */
  OPEN_FORUMS_EVENT: 1 << 18,
  /** Members entering and leaving audio / live sub-channels */
  AUDIO_OR_LIVE_CHANNEL_MEMBER: 1 << 19,
  /** Group members joining, changing, leaving, and join requests */
  GROUP_MEMBER_EVENT: 1 << 24,
  /** Group @ and full group messages, C2C messages, friend and group add / remove */
  GROUP_AND_C2C_EVENT: 1 << 25,
  /** Interactions: button callbacks and the like */
  INTERACTION: 1 << 26,
  /** Results of the audit some proactive messages go through */
  MESSAGE_AUDIT: 1 << 27,
  /** Forum events; private bots only */
  FORUMS_EVENT: 1 << 28,
  /** Audio playback and mic events */
  AUDIO_ACTION: 1 << 29,
  /** Guild messages that @ the bot (AT_MESSAGE_CREATE / PUBLIC_MESSAGE_DELETE) */
  PUBLIC_GUILD_MESSAGES: 1 << 30,
} as const

export type IntentName = keyof typeof Intents

/** Intents whose events come from guilds, the sub-bot's domain */
export const GUILD_INTENTS: IntentName[] = [
  'GUILDS', 'GUILD_MEMBERS', 'GUILD_MESSAGES', 'GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE', 'OPEN_FORUMS_EVENT',
  'AUDIO_OR_LIVE_CHANNEL_MEMBER', 'FORUMS_EVENT', 'AUDIO_ACTION', 'PUBLIC_GUILD_MESSAGES',
]

export interface GatewayPayload {
  op: number
  d?: any
  s?: number
  t?: string
  /** Event id: what a passive reply to a non-message event passes as event_id. */
  id?: string
}

export interface User {
  id: string
  username?: string
  avatar?: string
  bot?: boolean
  union_openid?: string
}

export interface ReadyData {
  session_id: string
  user?: User
}

export interface Author {
  id: string
  username?: string
  bot?: boolean
  member_openid?: string
  user_openid?: string
  union_openid?: string
  member_role?: 'owner' | 'admin' | 'member'
}

export interface Mention extends Partial<Author> {
  scope?: 'single' | 'all'
  is_you?: boolean
}

export interface Attachment {
  url: string
  filename?: string
  /** `image/*`, `video/mp4`, `voice` or `file` */
  content_type: string
  width?: number
  height?: number
  size?: number
  voice_wav_url?: string
  asr_refer_text?: string
}

export interface MessageElement {
  msg_idx?: string
  author?: Author
  message_type?: number
  content?: string
  attachments?: Attachment[]
  msg_elements?: MessageElement[]
}

/** GROUP_AT_MESSAGE_CREATE, GROUP_MESSAGE_CREATE and C2C_MESSAGE_CREATE */
export interface UserMessage {
  id: string
  author: Author
  content: string
  timestamp: string
  group_openid?: string
  group_id?: string
  message_type?: number
  /** `ext` holds `msg_idx=REFIDX_...` (this message) and `ref_msg_idx=...` (the one it quotes) */
  message_scene?: { source?: string; ext?: string[] }
  attachments?: Attachment[]
  mentions?: Mention[]
  msg_elements?: MessageElement[]
}

/** GROUP_ADD_ROBOT, GROUP_DEL_ROBOT, GROUP_MSG_RECEIVE, GROUP_MSG_REJECT */
export interface GroupEvent {
  timestamp: number
  group_openid: string
  op_member_openid?: string
}

/** FRIEND_ADD, FRIEND_DEL, C2C_MSG_RECEIVE, C2C_MSG_REJECT */
export interface UserEvent {
  timestamp: number
  openid: string
}

/** GROUP_MEMBER_ADD, GROUP_MEMBER_UPDATE, GROUP_MEMBER_REMOVE */
export interface GroupMemberEvent {
  group_openid: string
  member_openid: string
  user?: User
  member?: GuildMember
  op_member_openid?: string
  timestamp?: number
}

export interface JoinRequestVerifyInfo {
  method: 'verify_message' | 'admin_review_qa'
  verify_message?: string
  review_qa_list?: { question: string; answer: string }[]
}

/** GROUP_JOIN_REQUEST, and an item of the join request list */
export interface JoinRequest {
  join_request_id: string
  group_openid?: string
  member_openid: string
  username?: string
  apply_at?: string
  apply_source?: 'self_apply' | 'invited'
  invited_by?: string
  risk_tips?: string
  bot?: boolean
  verify_info?: JoinRequestVerifyInfo
  auto_approved?: { strategy_id: string }
  op_member_openid?: string
  timestamp?: number
}

export const ChatType = {
  Group: 1,
  Direct: 2,
  Channel: 3,
} as const

export interface Interaction {
  id: string
  /** 11 message button, 12 C2C quick menu; other interactions carry no button */
  type?: number
  chat_type?: number
  timestamp?: string
  guild_id?: string
  channel_id?: string
  group_openid?: string
  group_member_openid?: string
  user_openid?: string
  data?: {
    resolved?: {
      button_id?: string
      button_data?: string
      user_id?: string
    }
  }
}

/** A guild message: AT_MESSAGE_CREATE, MESSAGE_CREATE, DIRECT_MESSAGE_CREATE */
export interface GuildMessage {
  id: string
  author: User
  content?: string
  guild_id: string
  channel_id: string
  timestamp: string
  attachments?: Attachment[]
  member?: GuildMember
  message_reference?: { message_id: string }
  /** The real guild a direct message came from */
  src_guild_id?: string
  direct_message?: boolean
}

/** MESSAGE_DELETE, PUBLIC_MESSAGE_DELETE, DIRECT_MESSAGE_DELETE */
export interface MessageDeletion {
  message: Partial<GuildMessage>
  op_user?: { id: string }
}

export interface MessageReaction {
  user_id: string
  guild_id: string
  channel_id: string
  target: { id: string; type: string | number }
  emoji: { id: string; type: number }
}

export interface Guild {
  id: string
  name: string
  icon?: string
  owner_id?: string
  owner?: boolean
  member_count?: number
  max_members?: number
  description?: string
  joined_at?: string
  op_user_id?: string
}

export const ChannelType = {
  Text: 0,
  Voice: 2,
  Group: 4,
  Live: 10005,
  Application: 10006,
  Forum: 10007,
} as const

export interface GuildChannel {
  id: string
  guild_id: string
  name: string
  type: number
  sub_type?: number
  position?: number
  parent_id?: string
  owner_id?: string
  private_type?: number
  speak_permission?: number
  application_id?: string
  permissions?: string
  op_user_id?: string
}

export interface GuildMember {
  user?: User
  nick?: string
  roles?: string[]
  joined_at?: string
  /** Only on member events */
  guild_id?: string
  op_user_id?: string
}

/** MESSAGE_AUDIT_PASS, MESSAGE_AUDIT_REJECT */
export interface MessageAudited {
  audit_id: string
  message_id?: string
  guild_id?: string
  channel_id?: string
  audit_time?: string
  create_time?: string
}

/** GET /v2/groups/{group_openid}/info */
export interface GroupInfo {
  group_openid: string
  group_name: string
  group_member_num?: number
}

/** GET /v2/groups/{group_openid}/bot_state */
export interface BotGroupState {
  member_openid: string
  joined_at: string
  allow_proactive_msg: boolean
  recv_msg_setting: 'all' | 'only_mention' | 'mention_and_context'
  member_role: 'member' | 'owner' | 'admin'
}

export interface GroupMember {
  member_openid: string
  username?: string
  member_role?: 'member' | 'owner' | 'admin'
  bot?: boolean
  joined_at?: string
}

export interface RestrictChatSetting {
  members?: { member_openid: string; mute_expire_at: string }[]
}

export const MessageType = {
  Text: 0,
  Markdown: 2,
  Ark: 3,
  Embed: 4,
  Media: 7,
} as const

export interface Markdown {
  /** Native markdown; excludes the template fields */
  content?: string
  custom_template_id?: string
  params?: { key: string; values: string[] }[]
}

export interface Button {
  id?: string
  /** Callback buttons of a group grey out together once one is used */
  group_id?: string
  render_data: {
    label: string
    visited_label?: string
    /** 0 grey frame, 1 blue frame, 3 red text, 4 blue fill */
    style?: number
  }
  action: {
    /** 0 link, 1 callback, 2 command (puts `@bot data` into the input box) */
    type: number
    permission: {
      /** 0 the listed users, 1 admins, 2 everyone, 3 the listed roles (guilds only) */
      type: number
      specify_user_ids?: string[]
      specify_role_ids?: string[]
    }
    data: string
    reply?: boolean
    enter?: boolean
    anchor?: number
    modal?: { content?: string; confirm_text?: string; cancel_text?: string }
    click_limit?: number
    at_bot_show_channel_list?: boolean
    unsupport_tips?: string
  }
}

export interface Keyboard {
  /** A keyboard template */
  id?: string
  content?: { rows: { buttons: Button[] }[] }
}

export interface Ark {
  template_id: number
  kv: { key: string; value?: string; obj?: { obj_kv: { key: string; value: string }[] }[] }[]
}

export interface Stream {
  /** 1 while streaming, 10 and above ends it */
  state: number
  id?: string
  index?: number
  reset?: boolean
}

export interface SendRequest {
  msg_type: number
  content?: string
  markdown?: Markdown
  keyboard?: Keyboard
  ark?: Ark
  media?: { file_info: string }
  stream?: Stream
  msg_id?: string
  msg_seq?: number
  event_id?: string
  /** Takes a REFIDX_ index, not a message id */
  message_reference?: { message_id: string }
}

/** A guild channel or DM message; msg_type only matters for markdown */
export interface ChannelSendRequest {
  msg_type?: number
  content?: string
  markdown?: Markdown
  keyboard?: Keyboard
  ark?: Ark
  image?: string
  stream?: Stream
  msg_id?: string
  event_id?: string
  message_reference?: { message_id: string }
  /** Required with a keyboard in guilds */
  bot_appid?: string
}

export interface SendResponse {
  id?: string
  timestamp?: string
  ext_info?: { ref_idx?: string }
  /** The message waits for an audit; its id comes with MESSAGE_AUDIT_PASS */
  audit_id?: string
  /** Guild proactive messages under audit answer with code 304023 */
  code?: number
  data?: { message_audit?: { audit_id: string } }
}

export const FileType = {
  Image: 1,
  Video: 2,
  Audio: 3,
  File: 4,
} as const

export interface UploadRequest {
  file_type: number
  url?: string
  /** base64, at most 5 MB */
  file_data?: string
  file_name?: string
  srv_send_msg: false
}

export interface UploadResponse {
  file_uuid: string
  file_info: string
  ttl: number
}

export type MenuItemType = 'switch' | 'send_message' | 'link' | 'menu'

export interface SubMenuItem {
  name: string
  type: 'send_message' | 'link'
  send_message?: string
  link?: string
}

export interface MenuItem {
  name: string
  type: MenuItemType
  sub_menu_items?: SubMenuItem[]
  send_message?: string
  link?: string
  switch?: { switch_id: string; default: boolean }
}

export interface Menu {
  items: MenuItem[]
}

export interface PanelItem {
  name: string
  desc?: string
  type: 'command' | 'link'
  only_admin?: boolean
  link?: string
}

export interface PanelRecord {
  panel_id: string
  scope: 'c2c' | 'group' | 'channel' | 'dm'
  target_type: 'all' | 'specific'
  panel?: { items: PanelItem[]; remark?: string; version?: number }
}

export interface PanelList {
  records?: PanelRecord[]
  next_cursor?: string
  is_end?: boolean
}
