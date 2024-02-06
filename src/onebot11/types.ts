import {AtType, RawMessage} from "../common/types";

export enum OB11UserSex{
    male = "male",
    female = "female",
    unknown = "unknown"
}

export enum OB11GroupMemberRole{
    owner = "owner",
    admin = "admin",
    member = "member",
}

interface OB11Sender {
    user_id: string,
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
    self_id?: string,
    time: number,
    message_id: string,
    real_id: string,
    user_id: string,
    group_id?: string,
    message_type: "private" | "group",
    sub_type?: "friend" | "group" | "other",
    sender: OB11Sender,
    message: OB11MessageData[],
    raw_message: string,
    font: number,
    post_type?: "message",
    raw?: RawMessage
}

export type OB11ApiName =
    "send_private_msg"
    | "send_group_msg"
    | "get_group_list"
    | "get_friend_list"
    | "delete_msg"
    | "get_login_info"
    | "get_group_member_list"
    | "get_group_member_info"
    | "get_msg"

export interface OB11Return<DataType> {
    status: number
    retcode: number
    data: DataType
    message: string
}

export interface OB11SendMsgReturn extends OB11Return<{message_id: string}>{}

export enum OB11MessageDataType {
    text = "text",
    image = "image",
    voice = "record",
    at = "at",
    reply = "reply",
    json = "json"
}

export type OB11MessageData = {
    type: OB11MessageDataType.text,
    content: string,
    data?: {
        text: string, // 纯文本
    }
} | {
    type: "image" | "voice" | "record",
    file: string, // 本地路径
    data?: {
        file: string // 本地路径
    }
} | {
    type: OB11MessageDataType.at,
    atType?: AtType,
    content?: string,
    atUid?: string,
    atNtUid?: string,
    data?: {
        qq: string // at的qq号
    }
} | {
    type: OB11MessageDataType.reply,
    msgId: string,
    msgSeq: string,
    senderUin: string,
    data: {
        id: string,
    }
}