import {
  OB11GroupMember,
  OB11GroupMemberRole,
  OB11Message,
  OB11User,
  OB11UserSex,
} from './types'
import {
  ChatType,
  Friend,
  GroupMember,
  GroupMemberRole,
  RawMessage,
  Sex,
} from '../ntqqapi/types'
import { EventType } from './event/OB11BaseEvent'
import { OB11GroupUploadNoticeEvent } from './event/notice/OB11GroupUploadNoticeEvent'
import { OB11GroupNoticeEvent } from './event/notice/OB11GroupNoticeEvent'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { ParseMessageConfig } from './types'
import { transformIncomingSegments } from './transform/message'

export namespace OB11Entities {
  export async function message(
    ctx: Context,
    msg: RawMessage,
    config?: ParseMessageConfig
  ): Promise<OB11Message> {
    const selfUin = +selfInfo.uin
    const msgShortId = ctx.store.createMsgShortId(msg)
    const { segments, cqCode } = await transformIncomingSegments(ctx, msg)
    const resMsg: OB11Message = {
      self_id: selfUin,
      user_id: msg.senderUin,
      time: msg.msgTime,
      message_id: msgShortId,
      message_seq: msg.msgSeq,
      message_type: msg.chatType === ChatType.Group ? 'group' : 'private',
      sender: {
        user_id: msg.senderUin,
        nickname: msg.sendNickName
      },
      raw_message: cqCode,
      font: 14,
      sub_type: 'friend',
      message: config?.messageFormat === 'string' ? cqCode : segments,
      message_format: config?.messageFormat === 'string' ? 'string' : 'array',
      post_type: selfUin === msg.senderUin ? EventType.MESSAGE_SENT : EventType.MESSAGE,
      getSummaryEventName(): string {
        return this.post_type + '.' + this.message_type
      }
    }
    if (!config || config.debug) {
      resMsg.raw = msg
      resMsg.raw_pb = ''
      const uniqueId = `${msg.peerUin}_${msg.msgRandom}_${msg.msgSeq}`
      const msgPB = ctx.qqProtocol.msgPBMap.get(uniqueId)
      if (msgPB) {
        resMsg.raw_pb = msgPB
      }
    }
    if (msg.chatType === ChatType.Group) {
      resMsg.sub_type = 'normal'
      resMsg.group_id = msg.peerUin
      resMsg.group_name = msg.peerName
      resMsg.sender.card = msg.sendMemberName
      // 284840486: 合并转发内部
      if (msg.peerUin !== 284840486) {
        try {
          const member = await ctx.ntGroupApi.getGroupMemberByUid(msg.peerUin, msg.senderUid, false)
          resMsg.sender.nickname = member!.nick
          resMsg.sender.role = groupMemberRole(member!.role)
          resMsg.sender.level = member!.level.toString()
          resMsg.sender.title = member!.specialTitle
        } catch {
          resMsg.sender.nickname = msg.sendMemberName || msg.sendNickName
        }
      }
    }
    else if (msg.chatType === ChatType.C2C) {
      resMsg.sub_type = 'friend'
      if (msg.senderUin === 1094950020) {
        resMsg.sender.nickname = 'QQ用户'
      } else {
        try {
          resMsg.sender.nickname = (await ctx.ntFriendApi.getFriendByUid(msg.senderUid, false))!.nick
        } catch {
          resMsg.sender.nickname = msg.sendNickName || msg.senderUin.toString()
        }
      }
    }
    else if (msg.chatType === ChatType.TempC2CFromGroup) {
      resMsg.sub_type = 'group'
      resMsg.temp_source = 0 //群聊
      if (msg.senderUin === 1094950020) {
        resMsg.sender.nickname = 'QQ用户'
      } else {
        resMsg.sender.nickname = (await ctx.ntUserApi.getUserByUid(msg.senderUid)).nick
      }
      resMsg.sender.group_id = msg.tempFromGroupCode
    }

    return resMsg
  }

  export async function groupEvent(ctx: Context, msg: RawMessage): Promise<OB11GroupNoticeEvent | OB11GroupNoticeEvent[] | void> {
    if (msg.chatType !== ChatType.Group) {
      return
    }
    // wrapper 模式：msgType=5 是 GrayTip, 3 是 File
    // 直连模式：所有消息都映射为 msgType=2，靠 element 判别

    for (const element of msg.elements) {
      if (element.fileElement) {
        return new OB11GroupUploadNoticeEvent(msg.peerUin, msg.senderUin, {
          id: element.fileElement.fileUuid!,
          name: element.fileElement.fileName,
          size: element.fileElement.fileSize,
          busid: element.fileElement.fileBizId,
        })
      }
    }
  }

  export function friend(raw: Friend): OB11User {
    return {
      user_id: raw.uin,
      nickname: raw.nick,
      remark: raw.remark,
      sex: sex(raw.gender),
      birthday_year: raw.birthdayYear,
      birthday_month: raw.birthdayMonth,
      birthday_day: raw.birthdayDay,
      age: raw.age,
      qid: raw.qid,
      long_nick: raw.bio,
    }
  }

  export function friends(raw: Friend[]): OB11User[] {
    return raw.map(friend)
  }

  export function groupMemberRole(role: GroupMemberRole): OB11GroupMemberRole {
    if (role === GroupMemberRole.Owner) return OB11GroupMemberRole.Owner
    if (role === GroupMemberRole.Admin) return OB11GroupMemberRole.Admin
    return OB11GroupMemberRole.Member
  }

  export function sex(sex: Sex): OB11UserSex {
    const sexMap = {
      [Sex.Unknown]: OB11UserSex.Unknown,
      [Sex.Male]: OB11UserSex.Male,
      [Sex.Female]: OB11UserSex.Female,
      [Sex.Hidden]: OB11UserSex.Unknown
    }
    return sexMap[sex] ?? OB11UserSex.Unknown
  }

  export function groupMember(groupId: number, member: GroupMember): OB11GroupMember {
    const robotUinRanges = [
      {
        minUin: 3328144510,
        maxUin: 3328144510
      },
      {
        minUin: 2854196301,
        maxUin: 2854216399
      },
      {
        minUin: 66600000,
        maxUin: 66600000
      },
      {
        minUin: 3889000000,
        maxUin: 3889999999
      },
      {
        minUin: 4010000000,
        maxUin: 4019999999
      }
    ]
    return {
      group_id: groupId,
      user_id: member.uin,
      nickname: member.nick,
      card: member.cardName,
      card_or_nickname: member.cardName || member.nick,
      sex: OB11UserSex.Unknown,
      age: 0,
      area: '',
      level: String(member.level),
      qq_level: 0,
      join_time: member.joinedAt,
      last_sent_time: member.lastSpokeAt,
      title_expire_time: 0,
      unfriendly: false,
      card_changeable: true,
      is_robot: robotUinRanges.some(e => member.uin >= e.minUin && member.uin <= e.maxUin),
      shut_up_timestamp: member.shutupExpireTime,
      role: groupMemberRole(member.role),
      title: member.specialTitle,
    }
  }
}
