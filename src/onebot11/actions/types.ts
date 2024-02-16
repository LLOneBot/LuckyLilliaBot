import GetVersionInfo from "./GetVersionInfo";

export type BaseCheckResult = ValidCheckResult | InvalidCheckResult

export interface ValidCheckResult {
    valid: true
    [k: string | number]: any
}

export interface InvalidCheckResult {
    valid: false
    message: string
    [k: string | number]: any
}

export enum ActionName{
    GetLoginInfo = "get_login_info",
    GetFriendList = "get_friend_list",
    GetGroupInfo = "get_group_info",
    GetGroupList = "get_group_list",
    GetGroupMemberInfo = "get_group_member_info",
    GetGroupMemberList = "get_group_member_list",
    GetMsg = "get_msg",
    SendMsg = "send_msg",
    SendGroupMsg = "send_group_msg",
    SendPrivateMsg = "send_private_msg",
    DeleteMsg = "delete_msg",
    GetVersionInfo = "get_version_info",
    GetStatus = "get_status",
    CanSendRecord = "can_send_record",
    CanSendImage = "can_send_image",
}