import {AtType, RawMessage} from "../ntqqapi/types";
import {EventType} from "./event/OB11BaseEvent";

export interface OB11User {
    user_id: number;
    nickname: string;
    remark?: string
}

export enum OB11UserSex {
    male = "male",
    female = "female",
    unknown = "unknown"
}

export enum OB11GroupMemberRole {
    owner = "owner",
    admin = "admin",
    member = "member",
}

export interface OB11GroupMember {
    group_id: number
    user_id: number
    nickname: string
    card?: string
    sex?: OB11UserSex
    age?: number
    join_time?: number
    last_sent_time?: number
    level?: number
    role?: OB11GroupMemberRole
    title?: string
}

export interface OB11Group {
    group_id: number
    group_name: string
    member_count?: number
    max_member_count?: number
}

interface OB11Sender {
    user_id: number,
    nickname: string,
    sex?: OB11UserSex,
    age?: number,
    card?: string,  // 群名片
    level?: string,  // 群等级
    role?: OB11GroupMemberRole
}

export enum OB11MessageType {
    private = "private",
    group = "group"
}

export interface OB11Message {
    self_id?: number,
    time: number,
    message_id: number,
    real_id: string,
    user_id: number,
    group_id?: number,
    message_type: "private" | "group",
    sub_type?: "friend" | "group" | "normal",
    sender: OB11Sender,
    message: OB11MessageData[] | string,
    message_format: 'array' | 'string',
    raw_message: string,
    font: number,
    post_type?: EventType,
    raw?: RawMessage
}

export interface OB11Return<DataType> {
    status: string
    retcode: number
    data: DataType
    message: string,
    echo?: any, // ws调用api才有此字段
    wording?: string,  // go-cqhttp字段，错误信息
}

export enum OB11MessageDataType {
    text = "text",
    image = "image",
    voice = "record",
    at = "at",
    reply = "reply",
    json = "json",
    face = "face",
    node = "node"  // 合并转发消息
}

export interface OB11MessageText {
    type: OB11MessageDataType.text,
    data: {
        text: string, // 纯文本
    }
}

interface OB11MessageFileBase {
    data: {
        file: string,
        http_file?: string;
    }
}

export interface OB11MessageImage extends OB11MessageFileBase {
    type: OB11MessageDataType.image
}

export interface OB11MessageRecord extends OB11MessageFileBase {
    type: OB11MessageDataType.voice
}

export interface OB11MessageAt {
    type: OB11MessageDataType.at
    data: {
        qq: string | "all"
    }
}

export interface OB11MessageReply {
    type: OB11MessageDataType.reply
    data: {
        id: string
    }
}

export interface OB11MessageFace {
    type: OB11MessageDataType.face
    data: {
        id: string
    }
}

export type OB11MessageMixType = OB11MessageData[] | string | OB11MessageData;

export interface OB11MessageNode {
    type: OB11MessageDataType.node
    data: {
        id?: string
        user_id?: number
        nickname: string
        content: OB11MessageMixType
    }
}

export type OB11MessageData =
    OB11MessageText |
    OB11MessageFace |
    OB11MessageAt | OB11MessageReply |
    OB11MessageImage | OB11MessageRecord |
    OB11MessageNode

export interface OB11PostSendMsg {
    message_type?: "private" | "group"
    user_id: string,
    group_id?: string,
    message: OB11MessageMixType;
    messages?: OB11MessageMixType;  // 兼容 go-cqhttp
}

export interface OB11Version {
    app_name: "LLOneBot"
    app_version: string
    protocol_version: "v11"
}


export interface OB11Status {
    online: boolean | null,
    good: boolean
}

