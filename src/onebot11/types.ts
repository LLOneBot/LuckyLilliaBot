import { FaceType, PicSubType, RawMessage } from '../ntqqapi/types'
import { EventType } from './event/OB11BaseEvent'
import { IdMusicSignPostData, CustomMusicSignPostData } from '../common/utils/sign'

export interface OB11User {
  user_id: number
  nickname: string
  remark?: string
  sex?: OB11UserSex
  birthday_year?: number
  birthday_month?: number
  birthday_day?: number
  age?: number
  // 以下是 OB11 非标准字段
  qid: string,
  long_nick: string
  level: number  // 目前拿不到，一直是 0
  // 以下字段将在2025年10月23日后彻底删除
  longNick: string  // 个性签名
  eMail: string
  uid: string
  categoryId: number
  richTime: number // 暂时未知其含义
}

export enum OB11UserSex {
  Male = 'male',
  Female = 'female',
  Unknown = 'unknown',
}

export enum OB11GroupMemberRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
}

export interface OB11GroupMember {
  group_id: number
  user_id: number
  nickname: string
  card: string
  card_or_nickname: string
  sex: OB11UserSex
  age: number
  join_time: number
  last_sent_time: number
  level: string
  qq_level?: number
  role: OB11GroupMemberRole
  title: string
  area: string
  unfriendly: boolean
  title_expire_time: number
  card_changeable: boolean
  // 以下为gocq字段
  shut_up_timestamp: number
  // 以下为扩展字段
  is_robot?: boolean
  qage?: number
}

export interface OB11Group {
  group_id: number
  group_name: string
  group_memo: string // 群介绍
  group_create_time: number
  member_count: number
  max_member_count: number
  remark_name: string
}

interface OB11Sender {
  user_id: number
  nickname: string
  sex?: OB11UserSex
  age?: number
  card?: string // 群名片
  level?: string // 群等级
  role?: OB11GroupMemberRole
  group_id?: number // 当私聊 sub_type 为 group 时
  title?: string // 群聊专属头衔
}

export enum OB11MessageType {
  private = 'private',
  group = 'group',
}

export interface OB11Message {
  target_id?: number // 自己发送的消息才有此字段
  self_id: number
  time: number
  message_id: number
  message_seq: number
  real_id?: number // 仅在 get_msg 接口存在
  user_id: number
  group_id?: number
  group_name?: string
  message_type: 'private' | 'group'
  sub_type?: 'friend' | 'group' | 'normal'
  sender: OB11Sender
  message: OB11MessageData[] | string
  message_format: 'array' | 'string'
  raw_message: string
  font: number
  post_type: EventType
  raw?: RawMessage
  temp_source?: 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9
  getSummaryEventName(): string
}

export interface OB11ForwardMessage {
  content: OB11MessageData[] | string
  sender: {
    nickname: string
    user_id: number
  }
  time: number
  message_format: string //扩展
  message_type: string //扩展
}

export interface OB11Return<DataType> {
  status: string
  retcode: number
  data: DataType
  message: string
  echo?: unknown // ws调用api才有此字段
  wording?: string // go-cqhttp字段，错误信息
}

export enum OB11MessageDataType {
  Text = 'text',
  Image = 'image',
  Music = 'music',
  Video = 'video',
  Record = 'record',
  File = 'file',
  FlashFile = 'flash_file', // 闪传
  At = 'at',
  Reply = 'reply',
  Json = 'json',
  Face = 'face',
  Mface = 'mface', // 商城表情
  Markdown = 'markdown',
  Node = 'node', // 合并转发消息节点
  Forward = 'forward', // 合并转发消息，用于上报
  Xml = 'xml',
  Poke = 'poke',
  Dice = 'dice',
  Rps = 'rps',
  Contact = 'contact',
  Shake = 'shake',
  Keyboard = "keyboard",
}

export interface OB11MessageMFace {
  type: OB11MessageDataType.Mface
  data: {
    emoji_package_id: number
    emoji_id: string
    key: string
    summary?: string
    url?: string
  }
}

export interface OB11MessageKeyboard {
  type: OB11MessageDataType.Keyboard
  data: {
    rows: {
      buttons: {
        id: string;
        render_data: {
          label: string;
          visited_label: string;
          style: number;
        };
        action: {
          type: number;
          permission: {
            type: number;
            specify_role_ids: string[];
            specify_user_ids: string[];
          };
          unsupport_tips: string;
          data: string;
          reply: boolean;
          enter: boolean;
        };
      }[];
    }[];
  }
}


export interface OB11MessageDice {
  type: OB11MessageDataType.Dice
  data: {
    result: number /* intended */ | string /* in fact */
  }
}
export interface OB11MessageRPS {
  type: OB11MessageDataType.Rps
  data: {
    result: number | string
  }
}

export interface OB11MessageText {
  type: OB11MessageDataType.Text
  data: {
    text: string // 纯文本
  }
}

export interface OB11MessagePoke {
  type: OB11MessageDataType.Poke
  data: {
    qq?: number
    id?: number
  }
}

export interface OB11MessageFileBase {
  data: {
    thumb?: string
    name?: string
    file: string
    url?: string
    file_size?: string //扩展
  }
}

export interface OB11MessageImage extends OB11MessageFileBase {
  type: OB11MessageDataType.Image
  data: OB11MessageFileBase['data'] & {
    summary?: string // 图片摘要
    subType?: PicSubType
    type?: 'flash' | 'show'
  }
}

export interface OB11MessageRecord extends OB11MessageFileBase {
  type: OB11MessageDataType.Record
  data: OB11MessageFileBase['data'] & {
    path?: string //扩展
  }
}

export interface OB11MessageFile extends OB11MessageFileBase {
  type: OB11MessageDataType.File
  data: OB11MessageFileBase['data'] & {
    file_id?: string
    path?: string
  }
}

export interface OB11MessageFlashFile {
  type: OB11MessageDataType.FlashFile
  data: {
    title: string
    file_set_id: string
    scene_type: number
  }
}

export interface OB11MessageVideo extends OB11MessageFileBase {
  type: OB11MessageDataType.Video
  data: OB11MessageFileBase['data'] & {
    path?: string //扩展
  }
}

export interface OB11MessageAt {
  type: OB11MessageDataType.At
  data: {
    qq: string | 'all'
    name?: string
  }
}

export interface OB11MessageReply {
  type: OB11MessageDataType.Reply
  data: {
    id: string
  }
}

export interface OB11MessageFace {
  type: OB11MessageDataType.Face
  data: {
    id: string,
    sub_type?: FaceType
  }
}

export type OB11MessageMixType = OB11MessageData[] | string | OB11MessageData

export interface OB11MessageNode {
  type: OB11MessageDataType.Node
  data: {
    id?: number | string
    content?: OB11MessageMixType
    user_id?: number // ob11
    nickname?: string // ob11
    name?: string // gocq
    uin?: number | string // gocq
  }
}

export interface OB11MessageIdMusic {
  type: OB11MessageDataType.Music
  data: IdMusicSignPostData
}

export interface OB11MessageCustomMusic {
  type: OB11MessageDataType.Music
  data: Omit<CustomMusicSignPostData, 'singer'> & { content?: string }
}

export type OB11MessageMusic = OB11MessageIdMusic | OB11MessageCustomMusic

export interface OB11MessageJson {
  type: OB11MessageDataType.Json
  data: { data: string /* , config: { token: string } */ }
}

export interface OB11MessageMarkdown {
  type: OB11MessageDataType.Markdown
  data: {
    content: string
  }
}

export interface OB11MessageForward {
  type: OB11MessageDataType.Forward
  data: {
    id: string
  }
}

export interface OB11MessageContact {
  type: OB11MessageDataType.Contact
  data: {
    type: 'qq' | 'group'
    id: string
  }
}

export interface OB11MessageShake {
  type: OB11MessageDataType.Shake
  data: Record<string, never>
}

export type OB11MessageData =
  | OB11MessageText
  | OB11MessageFace
  | OB11MessageMFace
  | OB11MessageAt
  | OB11MessageReply
  | OB11MessageImage
  | OB11MessageRecord
  | OB11MessageFile
  | OB11MessageFlashFile
  | OB11MessageVideo
  | OB11MessageNode
  | OB11MessageIdMusic
  | OB11MessageCustomMusic
  | OB11MessageJson
  | OB11MessagePoke
  | OB11MessageDice
  | OB11MessageRPS
  | OB11MessageMarkdown
  | OB11MessageForward
  | OB11MessageContact
  | OB11MessageShake
  | OB11MessageKeyboard

export interface OB11PostSendMsg {
  message_type?: 'private' | 'group'
  user_id?: string | number
  group_id?: string | number
  message: OB11MessageMixType
  messages?: OB11MessageMixType // 兼容 go-cqhttp
  auto_escape?: boolean | string
}

export interface OB11Version {
  app_name: 'LLOneBot'
  app_version: string
  protocol_version: 'v11'
}

export interface OB11Status {
  online: boolean | null
  good: boolean
  stat: {
    message_received: number
    message_sent: number
    last_message_time: number
    startup_time: number
  }
}

export interface OB11GroupFile {
  group_id: number
  file_id: string
  file_name: string
  busid: number
  file_size: number
  upload_time: number
  dead_time: number
  modify_time: number
  download_times: number
  uploader: number
  uploader_name: string
}

export interface OB11GroupFileFolder {
  group_id: number
  folder_id: string
  folder_name: string
  create_time: number
  creator: number
  creator_name: string
  total_file_count: number
}
