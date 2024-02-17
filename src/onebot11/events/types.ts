import { OB11Status } from "../types";

export enum OB11EventPostType{
    META = "meta_event",
    NOTICE = "notice"
}

export interface OB11EventBase {
    time: number
    self_id: number
    post_type: OB11EventPostType
}

export interface OB11MetaEvent extends OB11EventBase{
    post_type: OB11EventPostType.META
    meta_event_type: "lifecycle" | "heartbeat"
}

export interface OB11NoticeEvent extends OB11EventBase{
    post_type: OB11EventPostType.NOTICE
    notice_type: "group_admin" | "group_decrease" | "group_increase" | "group_ban" | "friend_add" | "group_recall" | "friend_recall"
}

interface OB11GroupNoticeBase extends OB11NoticeEvent{
    group_id: number
    user_id: number
}

export interface OB11GroupAdminNoticeEvent extends OB11GroupNoticeBase{
    notice_type: "group_admin"
    sub_type: "set" | "unset"
}

export interface OB11GroupMemberDecNoticeEvent extends OB11GroupNoticeBase{
    notice_type: "group_decrease"
    sub_type: "leave" | "kick" | "kick_me"
    operator_id: number
}

export interface OB11GroupMemberIncNoticeEvent extends OB11GroupNoticeBase{
    notice_type: "group_increase"
    sub_type: "approve" | "invite"
    operator_id: number
}

export interface OB11GroupRecallNoticeEvent extends OB11GroupNoticeBase{
    notice_type: "group_recall"
    operator_id: number
    message_id: number
}

export interface OB11FriendRecallNoticeEvent extends OB11NoticeEvent{
    notice_type: "friend_recall"
    user_id: number
    message_id: number
}

export interface OB11LifeCycleEvent extends OB11MetaEvent {
    meta_event_type: "lifecycle"
    sub_type: "enable" | "disable" | "connect"
}

export interface OB11HeartEvent extends OB11MetaEvent {
    meta_event_type: "heartbeat"
    status: OB11Status
    interval: number
}