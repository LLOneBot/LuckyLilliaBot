import {
    OB11MessageDataType,
    OB11GroupMemberRole,
    OB11Message,
    OB11Group,
    OB11GroupMember,
    OB11User, OB11LifeCycleEvent, OB11HeartEvent
} from "./types";
import { AtType, ChatType, Group, GroupMember, IMAGE_HTTP_HOST, RawMessage, SelfInfo, User } from '../ntqqapi/types';
import { getFriend, getGroupMember, getHistoryMsgBySeq, heartInterval, msgHistory, selfInfo } from '../common/data';
import { file2base64, getConfigUtil, log } from "../common/utils";
import { NTQQApi } from "../ntqqapi/ntcall";


export class OB11Constructor {
    static async message(msg: RawMessage): Promise<OB11Message> {

        const {enableBase64} = getConfigUtil().getConfig()
        const message_type = msg.chatType == ChatType.group ? "group" : "private";
        const resMsg: OB11Message = {
            self_id: parseInt(selfInfo.uin),
            user_id: parseInt(msg.senderUin),
            time: parseInt(msg.msgTime) || 0,
            message_id: msg.msgShortId,
            real_id: msg.msgId,
            message_type: msg.chatType == ChatType.group ? "group" : "private",
            sender: {
                user_id: parseInt(msg.senderUin),
                nickname: msg.sendNickName,
                card: msg.sendMemberName || "",
            },
            raw_message: "",
            font: 14,
            sub_type: "friend",
            message: [],
            post_type: "message",
        }
        if (msg.chatType == ChatType.group) {
            resMsg.sub_type = "normal"
            resMsg.group_id = parseInt(msg.peerUin)
            const member = await getGroupMember(msg.peerUin, msg.senderUin);
            if (member) {
                resMsg.sender.role = OB11Constructor.groupMemberRole(member.role);
                resMsg.sender.nickname = member.nick
            }
        } else if (msg.chatType == ChatType.friend) {
            resMsg.sub_type = "friend"
            const friend = await getFriend(msg.senderUin);
            if (friend) {
                resMsg.sender.nickname = friend.nick;
            }
        } else if (msg.chatType == ChatType.temp) {
            resMsg.sub_type = "group"
        }

        for (let element of msg.elements) {
            let message_data: any = {
                data: {},
                type: "unknown"
            }
            if (element.textElement && element.textElement?.atType !== AtType.notAt) {
                message_data["type"] = OB11MessageDataType.at
                if (element.textElement.atType == AtType.atAll) {
                    message_data["data"]["mention"] = "all"
                    message_data["data"]["qq"] = "all"
                } else {
                    let atUid = element.textElement.atNtUid
                    let atQQ = element.textElement.atUid
                    if (!atQQ || atQQ === "0") {
                        const atMember = await getGroupMember(msg.peerUin, null, atUid)
                        if (atMember) {
                            atQQ = atMember.uin
                        }
                    }
                    if (atQQ) {
                        message_data["data"]["mention"] = atQQ
                        message_data["data"]["qq"] = atQQ
                    }
                }
            } else if (element.textElement) {
                message_data["type"] = "text"
                message_data["data"]["text"] = element.textElement.content
            } else if (element.picElement) {
                message_data["type"] = "image"
                message_data["data"]["file_id"] = element.picElement.fileUuid
                message_data["data"]["path"] = element.picElement.sourcePath
                message_data["data"]["file"] = element.picElement.sourcePath
                try {
                    await NTQQApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                        element.elementId, element.picElement.thumbPath.get(0), element.picElement.sourcePath)
                } catch (e) {
                    message_data["data"]["http_file"] = IMAGE_HTTP_HOST + element.picElement.originImageUrl
                }
            } else if (element.replyElement) {
                message_data["type"] = "reply"
                const replyMsg = getHistoryMsgBySeq(element.replyElement.replayMsgSeq)
                if (replyMsg) {
                    message_data["data"]["id"] = replyMsg.msgShortId
                } else {
                    continue
                }
            } else if (element.pttElement) {
                message_data["type"] = OB11MessageDataType.voice;
                message_data["data"]["file"] = element.pttElement.filePath
                message_data["data"]["file_id"] = element.pttElement.fileUuid
                // console.log("收到语音消息", message.raw.msgId, message.peer, element.pttElement)
                // window.LLAPI.Ptt2Text(message.raw.msgId, message.peer, messages).then(text => {
                //     console.log("语音转文字结果", text);
                // }).catch(err => {
                //     console.log("语音转文字失败", err);
                // })
            } else if (element.arkElement) {
                message_data["type"] = OB11MessageDataType.json;
                message_data["data"]["data"] = element.arkElement.bytesData;
            }
            if (message_data.data.http_file) {
                message_data.data.file = message_data.data.http_file
            } else if (message_data.data.file) {
                let filePath: string = message_data.data.file;
                message_data.data.file = "file://" + filePath
                if (enableBase64) {
                    let {err, data} = await file2base64(filePath);
                    if (err) {
                        console.log("文件转base64失败", err)
                    } else {
                        message_data.data.file = "base64://" + data
                    }
                }
            }
            if (message_data.type !== "unknown" && message_data.data) {
                resMsg.message.push(message_data);
            }
        }
        return resMsg;
    }

    static friend(friend: User): OB11User {
        return {
            user_id: parseInt(friend.uin),
            nickname: friend.nick,
            remark: friend.remark
        }

    }

    static selfInfo(selfInfo: SelfInfo): OB11User {
        return {
            user_id: parseInt(selfInfo.uin),
            nickname: selfInfo.nick
        }
    }

    static friends(friends: User[]): OB11User[] {
        return friends.map(OB11Constructor.friend)
    }

    static groupMemberRole(role: number): OB11GroupMemberRole | undefined {
        return {
            4: OB11GroupMemberRole.owner,
            3: OB11GroupMemberRole.admin,
            2: OB11GroupMemberRole.member
        }[role]
    }

    static groupMember(group_id: string, member: GroupMember): OB11GroupMember {
        return {
            group_id: parseInt(group_id),
            user_id: parseInt(member.uin),
            nickname: member.nick,
            card: member.cardName
        }
    }

    static groupMembers(group: Group): OB11GroupMember[] {
        log("construct ob11 group members", group)
        return group.members.map(m => OB11Constructor.groupMember(group.groupCode, m))
    }

    static group(group: Group): OB11Group {
        return {
            group_id: parseInt(group.groupCode),
            group_name: group.groupName
        }
    }

    static groups(groups: Group[]): OB11Group[] {
        return groups.map(OB11Constructor.group)
    }

    static lifeCycleEvent(): OB11LifeCycleEvent {
        return {
            time: Math.floor(Date.now() / 1000),
            self_id: parseInt(selfInfo.uin),
            post_type: "meta_event",
            meta_event_type: "lifecycle",
            sub_type: "connect"
        }
    }

    static heartEvent(): OB11HeartEvent {
        return {
            time: Math.floor(Date.now() / 1000),
            self_id: parseInt(selfInfo.uin),
            post_type: "meta_event",
            meta_event_type: "heartbeat",
            status: {
                online: true,
                good: true
            },
            interval: heartInterval
        }
    }
}