import {OB11MessageDataType, OB11GroupMemberRole, OB11Message, OB11MessageData, OB11Group, OB11GroupMember, Friend} from "./types";
import { AtType, ChatType, Group, GroupMember, RawMessage, User } from '../ntqqapi/types';
import {getFriend, getGroupMember, getHistoryMsgBySeq, msgHistory, selfInfo} from "../common/data";
import {file2base64, getConfigUtil} from "../common/utils";


export class OB11Constructor {
    static async message(msg: RawMessage): Promise<OB11Message> {
        const {enableBase64} = getConfigUtil().getConfig()
        const message_type = msg.chatType == ChatType.group ? "group" : "private";
        const resMsg: OB11Message = {
            self_id: selfInfo.user_id,
            user_id: msg.senderUin,
            time: parseInt(msg.msgTime) || 0,
            message_id: msg.msgId,
            real_id: msg.msgId,
            message_type: msg.chatType == ChatType.group ? "group" : "private",
            sender: {
                user_id: msg.senderUin,
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
            resMsg.group_id = msg.peerUin
            const member = await getGroupMember(msg.peerUin, msg.senderUin);
            if (member) {
                resMsg.sender.role = OB11Constructor.groupMemberRole(member.role);
            }
        } else if (msg.chatType == ChatType.friend) {
            resMsg.sub_type = "friend"
            const friend = await getFriend(msg.senderUin);
            if (friend) {
                resMsg.sender.nickname = friend.nickName;
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
                    let uid = element.textElement.atUid
                    let atMember = await getGroupMember(msg.peerUin, uid)
                    message_data["data"]["mention"] = atMember?.uin
                    message_data["data"]["qq"] = atMember?.uin
                }
            } else if (element.textElement) {
                message_data["type"] = "text"
                message_data["data"]["text"] = element.textElement.content
            } else if (element.picElement) {
                message_data["type"] = "image"
                message_data["data"]["file_id"] = element.picElement.fileUuid
                message_data["data"]["path"] = element.picElement.sourcePath
                message_data["data"]["file"] = element.picElement.sourcePath
            } else if (element.replyElement) {
                message_data["type"] = "reply"
                const replyMsg = getHistoryMsgBySeq(element.replyElement.replayMsgSeq)
                if (replyMsg) {
                    message_data["data"]["id"] = replyMsg.msgId
                }
                else{
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
            if (message_data.data.file) {
                let filePath: string = message_data.data.file;
                message_data.data.file = "file://" + filePath
                if (enableBase64) {
                    // filePath = filePath.replace("\\Ori\\", "\\Thumb\\")
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
        // if (msgHistory.length > 10000) {
        //     msgHistory.splice(0, 100)
        // }
        // msgHistory.push(message)
        // if (!reportSelfMessage && onebot_message_data["user_id"] == self_qq) {
        //     console.log("开启了不上传自己发送的消息，进行拦截 ", onebot_message_data);
        // } else {
        //     console.log("发送上传消息给ipc main", onebot_message_data);
        //     window.llonebot.postData(onebot_message_data);
        // }
        return resMsg;
    }
    
    static friend(friend: User): Friend{
        return {
            user_id: friend.uin,
            nickname: friend.nickName,
            remark: friend.raw.remark
        }
        
    }

    static friends(friends: User[]): Friend[]{
        return friends.map(OB11Constructor.friend)
    }

    static groupMemberRole(role: number): OB11GroupMemberRole | undefined {
        return {
            4: OB11GroupMemberRole.owner,
            3: OB11GroupMemberRole.admin,
            2: OB11GroupMemberRole.member
        }[role]
    }

    static groupMember(group_id: string, member: GroupMember): OB11GroupMember{
        return {
            group_id,
            user_id: member.uin,
            nickname: member.nick,
            card: member.cardName
        }
    }

    static groupMembers(group: Group): OB11GroupMember[]{
        return group.members.map(m=>OB11Constructor.groupMember(group.groupCode, m))
    }

    static group(group: Group): OB11Group{
        return {
            group_id: group.groupCode,
            group_name: group.groupName
        }
    }

    static groups(groups: Group[]): OB11Group[]{
        return groups.map(OB11Constructor.group)
    }
}