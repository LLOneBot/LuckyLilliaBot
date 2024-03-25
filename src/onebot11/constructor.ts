import {
    OB11Group,
    OB11GroupMember,
    OB11GroupMemberRole,
    OB11Message,
    OB11MessageData,
    OB11MessageDataType,
    OB11User,
    OB11UserSex
} from "./types";
import {
    AtType,
    ChatType,
    GrayTipElementSubType,
    Group,
    GroupMember,
    IMAGE_HTTP_HOST,
    RawMessage,
    SelfInfo,
    Sex,
    TipGroupElementType,
    User, VideoElement
} from '../ntqqapi/types';
import {getFriend, getGroupMember, selfInfo, tempGroupCodeMap} from '../common/data';
import {EventType} from "./event/OB11BaseEvent";
import {encodeCQCode} from "./cqcode";
import {dbUtil} from "../common/db";
import {OB11GroupIncreaseEvent} from "./event/notice/OB11GroupIncreaseEvent";
import {OB11GroupBanEvent} from "./event/notice/OB11GroupBanEvent";
import {OB11GroupUploadNoticeEvent} from "./event/notice/OB11GroupUploadNoticeEvent";
import {OB11GroupNoticeEvent} from "./event/notice/OB11GroupNoticeEvent";
import {NTQQUserApi} from "../ntqqapi/api/user";
import {NTQQFileApi} from "../ntqqapi/api/file";
import {calcQQLevel} from "../common/utils/qqlevel";
import {log} from "../common/utils/log";
import {sleep} from "../common/utils/helper";
import {getConfigUtil} from "../common/config";
import {OB11GroupTitleEvent} from "./event/notice/OB11GroupTitleEvent";
import {OB11GroupCardEvent} from "./event/notice/OB11GroupCardEvent";


export class OB11Constructor {
    static async message(msg: RawMessage): Promise<OB11Message> {

        const {enableLocalFile2Url, ob11: {messagePostFormat}} = getConfigUtil().getConfig()
        const message_type = msg.chatType == ChatType.group ? "group" : "private";
        const resMsg: OB11Message = {
            self_id: parseInt(selfInfo.uin),
            user_id: parseInt(msg.senderUin),
            time: parseInt(msg.msgTime) || Date.now(),
            message_id: msg.msgShortId,
            real_id: msg.msgShortId,
            message_type: msg.chatType == ChatType.group ? "group" : "private",
            sender: {
                user_id: parseInt(msg.senderUin),
                nickname: msg.sendNickName,
                card: msg.sendMemberName || "",
            },
            raw_message: "",
            font: 14,
            sub_type: "friend",
            message: messagePostFormat === 'string' ? '' : [],
            message_format: messagePostFormat === 'string' ? 'string' : 'array',
            post_type: selfInfo.uin == msg.senderUin ? EventType.MESSAGE_SENT : EventType.MESSAGE,
        }
        if (msg.chatType == ChatType.group) {
            resMsg.sub_type = "normal" // 这里go-cqhttp是group，而onebot11标准是normal, 蛋疼
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
            const tempGroupCode = tempGroupCodeMap[msg.peerUin]
            if (tempGroupCode) {
                resMsg.group_id = parseInt(tempGroupCode)
            }
        }

        for (let element of msg.elements) {
            let message_data: OB11MessageData | any = {
                data: {},
                type: "unknown"
            }
            if (element.textElement && element.textElement?.atType !== AtType.notAt) {
                message_data["type"] = OB11MessageDataType.at
                if (element.textElement.atType == AtType.atAll) {
                    // message_data["data"]["mention"] = "all"
                    message_data["data"]["qq"] = "all"
                } else {
                    let atUid = element.textElement.atNtUid
                    let atQQ = element.textElement.atUid
                    if (!atQQ || atQQ === "0") {
                        const atMember = await getGroupMember(msg.peerUin, atUid)
                        if (atMember) {
                            atQQ = atMember.uin
                        }
                    }
                    if (atQQ) {
                        // message_data["data"]["mention"] = atQQ
                        message_data["data"]["qq"] = atQQ
                    }
                }
            } else if (element.textElement) {
                message_data["type"] = "text"
                let text = element.textElement.content
                if (!text.trim()) {
                    continue;
                }
                message_data["data"]["text"] = text
            } else if (element.replyElement) {
                message_data["type"] = "reply"
                // log("收到回复消息", element.replyElement.replayMsgSeq)
                try {
                    const replyMsg = await dbUtil.getMsgBySeqId(element.replyElement.replayMsgSeq)
                    // log("找到回复消息", replyMsg.msgShortId, replyMsg.msgId)
                    if (replyMsg) {
                        message_data["data"]["id"] = replyMsg.msgShortId.toString()
                    } else {
                        continue
                    }
                } catch (e) {
                    log("获取不到引用的消息", e.stack, element.replyElement.replayMsgSeq)
                }

            } else if (element.picElement) {
                message_data["type"] = "image"
                // message_data["data"]["file"] = element.picElement.sourcePath
                message_data["data"]["file"] = element.picElement.fileName
                // message_data["data"]["path"] = element.picElement.sourcePath
                const url = element.picElement.originImageUrl
                const fileMd5 = element.picElement.md5HexStr
                if (url) {
                    message_data["data"]["url"] = IMAGE_HTTP_HOST + url
                } else if (fileMd5 && element.picElement.fileUuid.indexOf("_") === -1) { // fileuuid有下划线的是Linux发送的，这个url是另外的格式，目前尚未得知如何组装
                    message_data["data"]["url"] = `${IMAGE_HTTP_HOST}/gchatpic_new/0/0-0-${fileMd5.toUpperCase()}/0`
                }
                // message_data["data"]["file_id"] = element.picElement.fileUuid
                message_data["data"]["file_size"] = element.picElement.fileSize
                dbUtil.addFileCache(element.picElement.fileName, {
                    fileName: element.picElement.fileName,
                    filePath: element.picElement.sourcePath,
                    fileSize: element.picElement.fileSize.toString(),
                    url: message_data["data"]["url"],
                    downloadFunc: async () => {
                        await NTQQFileApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                            element.elementId, element.picElement.thumbPath?.get(0) || "", element.picElement.sourcePath)
                    }
                }).then()
                // 不在自动下载图片

            } else if (element.videoElement || element.fileElement) {
                const videoOrFileElement = element.videoElement || element.fileElement
                const ob11MessageDataType = element.videoElement ? OB11MessageDataType.video : OB11MessageDataType.file
                message_data["type"] = ob11MessageDataType;
                message_data["data"]["file"] = videoOrFileElement.fileName
                message_data["data"]["path"] = videoOrFileElement.filePath
                message_data["data"]["file_id"] = videoOrFileElement.fileUuid
                message_data["data"]["file_size"] = videoOrFileElement.fileSize
                dbUtil.addFileCache(videoOrFileElement.fileUuid, {
                    msgId: msg.msgId,
                    fileName: videoOrFileElement.fileName,
                    filePath: videoOrFileElement.filePath,
                    fileSize: videoOrFileElement.fileSize,
                    downloadFunc: async () => {
                        await NTQQFileApi.downloadMedia(
                            msg.msgId, msg.chatType, msg.peerUid,
                            element.elementId,
                            ob11MessageDataType == OB11MessageDataType.video ? (videoOrFileElement as VideoElement).thumbPath.get(0) : null,
                            videoOrFileElement.filePath)
                    }
                }).then()
                // 怎么拿到url呢
            } else if (element.pttElement) {
                message_data["type"] = OB11MessageDataType.voice;
                message_data["data"]["file"] = element.pttElement.fileName
                message_data["data"]["path"] = element.pttElement.filePath
                // message_data["data"]["file_id"] = element.pttElement.fileUuid
                message_data["data"]["file_size"] = element.pttElement.fileSize
                dbUtil.addFileCache(element.pttElement.fileName, {
                    fileName: element.pttElement.fileName,
                    filePath: element.pttElement.filePath,
                    fileSize: element.pttElement.fileSize,
                }).then()

                // log("收到语音消息", msg)
                // window.LLAPI.Ptt2Text(message.raw.msgId, message.peer, messages).then(text => {
                //     console.log("语音转文字结果", text);
                // }).catch(err => {
                //     console.log("语音转文字失败", err);
                // })
            } else if (element.arkElement) {
                message_data["type"] = OB11MessageDataType.json;
                message_data["data"]["data"] = element.arkElement.bytesData;
            } else if (element.faceElement) {
                message_data["type"] = OB11MessageDataType.face;
                message_data["data"]["id"] = element.faceElement.faceIndex.toString();
            } else if (element.marketFaceElement) {
                message_data["type"] = OB11MessageDataType.mface;
                message_data["data"]["text"] = element.marketFaceElement.faceName;
            }
            if (message_data.type !== "unknown" && message_data.data) {
                const cqCode = encodeCQCode(message_data);
                if (messagePostFormat === 'string') {
                    (resMsg.message as string) += cqCode;
                } else (resMsg.message as OB11MessageData[]).push(message_data);

                resMsg.raw_message += cqCode;
            }
        }
        resMsg.raw_message = resMsg.raw_message.trim();
        return resMsg;
    }

    static async GroupEvent(msg: RawMessage): Promise<OB11GroupNoticeEvent> {
        if (msg.chatType !== ChatType.group) {
            return;
        }
        if (msg.senderUin){
            let member = await getGroupMember(msg.peerUid, msg.senderUin);
            if (member && member.cardName !== msg.sendMemberName) {
                const event = new OB11GroupCardEvent(parseInt(msg.peerUid), parseInt(msg.senderUin), msg.sendMemberName, member.cardName)
                member.cardName = msg.sendMemberName;
                return event
            }
        }
        // log("group msg", msg);
        for (let element of msg.elements) {
            const grayTipElement = element.grayTipElement
            const groupElement = grayTipElement?.groupElement
            if (groupElement) {
                // log("收到群提示消息", groupElement)
                if (groupElement.type == TipGroupElementType.memberIncrease) {
                    log("收到群成员增加消息", groupElement)
                    await sleep(1000);
                    const member = await getGroupMember(msg.peerUid, groupElement.memberUid);
                    let memberUin = member?.uin;
                    if (!memberUin) {
                        memberUin = (await NTQQUserApi.getUserDetailInfo(groupElement.memberUid)).uin
                    }
                    // log("获取新群成员QQ", memberUin)
                    const adminMember = await getGroupMember(msg.peerUid, groupElement.adminUid);
                    // log("获取同意新成员入群的管理员", adminMember)
                    if (memberUin) {
                        const operatorUin = adminMember?.uin || memberUin
                        let event = new OB11GroupIncreaseEvent(parseInt(msg.peerUid), parseInt(memberUin), parseInt(operatorUin));
                        // log("构造群增加事件", event)
                        return event;
                    }
                } else if (groupElement.type === TipGroupElementType.ban) {
                    log("收到群群员禁言提示", groupElement)
                    const memberUid = groupElement.shutUp.member.uid
                    const adminUid = groupElement.shutUp.admin.uid
                    let memberUin: string = ""
                    let duration = parseInt(groupElement.shutUp.duration)
                    let sub_type: "ban" | "lift_ban" = duration > 0 ? "ban" : "lift_ban"
                    if (memberUid) {
                        memberUin = (await getGroupMember(msg.peerUid, memberUid))?.uin || (await NTQQUserApi.getUserDetailInfo(memberUid))?.uin
                    } else {
                        memberUin = "0";  // 0表示全员禁言
                        if (duration > 0) {
                            duration = -1
                        }
                    }
                    const adminUin = (await getGroupMember(msg.peerUid, adminUid))?.uin || (await NTQQUserApi.getUserDetailInfo(adminUid))?.uin
                    if (memberUin && adminUin) {
                        return new OB11GroupBanEvent(parseInt(msg.peerUid), parseInt(memberUin), parseInt(adminUin), duration, sub_type);
                    }
                }
            } else if (element.fileElement) {
                return new OB11GroupUploadNoticeEvent(parseInt(msg.peerUid), parseInt(msg.senderUin), {
                    id: element.fileElement.fileUuid,
                    name: element.fileElement.fileName,
                    size: parseInt(element.fileElement.fileSize),
                    busid: element.fileElement.fileBizId || 0
                })
            }

            if (grayTipElement) {
                if (grayTipElement.subElementType == GrayTipElementSubType.INVITE_NEW_MEMBER) {
                    log("收到新人被邀请进群消息", grayTipElement)
                    const xmlElement = grayTipElement.xmlElement
                    if (xmlElement?.content) {
                        const regex = /jp="(\d+)"/g;

                        let matches = [];
                        let match = null

                        while ((match = regex.exec(xmlElement.content)) !== null) {
                            matches.push(match[1]);
                        }
                        if (matches.length === 2) {
                            const [inviter, invitee] = matches;
                            return new OB11GroupIncreaseEvent(parseInt(msg.peerUid), parseInt(invitee), parseInt(inviter), "invite");
                        }
                    }
                } else if (grayTipElement.subElementType == GrayTipElementSubType.MEMBER_NEW_TITLE) {
                    const json = JSON.parse(grayTipElement.jsonGrayTipElement.jsonStr)
                    /*
                    {
                      align: 'center',
                      items: [
                        { txt: '恭喜', type: 'nor' },
                        {
                          col: '3',
                          jp: '5',
                          param: ["QQ号"],
                          txt: '林雨辰',
                          type: 'url'
                        },
                        { txt: '获得群主授予的', type: 'nor' },
                        {
                          col: '3',
                          jp: '',
                          txt: '好好好',
                          type: 'url'
                        },
                        { txt: '头衔', type: 'nor' }
                      ]
                    }

                    * */
                    const memberUin = json.items[1].param[0]
                    const title = json.items[3].txt
                    log("收到群成员新头衔消息", json)
                    return new OB11GroupTitleEvent(parseInt(msg.peerUid), parseInt(memberUin), title)
                }
            }
        }
    }

    static friend(friend: User): OB11User {
        return {
            user_id: parseInt(friend.uin),
            nickname: friend.nick,
            remark: friend.remark,
            sex: OB11Constructor.sex(friend.sex),
            level: friend.qqLevel && calcQQLevel(friend.qqLevel) || 0
        }
    }

    static selfInfo(selfInfo: SelfInfo): OB11User {
        return {
            user_id: parseInt(selfInfo.uin),
            nickname: selfInfo.nick,
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

    static sex(sex: Sex): OB11UserSex {
        const sexMap = {
            [Sex.male]: OB11UserSex.male,
            [Sex.female]: OB11UserSex.female,
            [Sex.unknown]: OB11UserSex.unknown
        }
        return sexMap[sex] || OB11UserSex.unknown
    }

    static groupMember(group_id: string, member: GroupMember): OB11GroupMember {
        return {
            group_id: parseInt(group_id),
            user_id: parseInt(member.uin),
            nickname: member.nick,
            card: member.cardName,
            sex: OB11Constructor.sex(member.sex),
            age: 0,
            area: "",
            level: 0,
            qq_level: member.qqLevel && calcQQLevel(member.qqLevel) || 0,
            join_time: 0,  // 暂时没法获取
            last_sent_time: 0,  // 暂时没法获取
            title_expire_time: 0,
            unfriendly: false,
            card_changeable: true,
            is_robot: member.isRobot,
            shut_up_timestamp: member.shutUpTime,
            role: OB11Constructor.groupMemberRole(member.role),
        }
    }

    static stranger(user: User): OB11User {
        return {
            ...user,
            user_id: parseInt(user.uin),
            nickname: user.nick,
            sex: OB11Constructor.sex(user.sex),
            age: 0,
            qid: user.qid,
            login_days: 0,
            level: user.qqLevel && calcQQLevel(user.qqLevel) || 0,
        }
    }

    static groupMembers(group: Group): OB11GroupMember[] {
        log("construct ob11 group members", group)
        return group.members.map(m => OB11Constructor.groupMember(group.groupCode, m))
    }

    static group(group: Group): OB11Group {
        return {
            group_id: parseInt(group.groupCode),
            group_name: group.groupName,
            member_count: group.memberCount,
            max_member_count: group.maxMember
        }
    }

    static groups(groups: Group[]): OB11Group[] {
        return groups.map(OB11Constructor.group)
    }
}
