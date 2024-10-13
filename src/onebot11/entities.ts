import { XMLParser } from 'fast-xml-parser'
import {
  OB11Group,
  OB11GroupMember,
  OB11GroupMemberRole,
  OB11Message,
  OB11MessageData,
  OB11MessageDataType,
  OB11User,
  OB11UserSex,
} from './types'
import {
  AtType,
  ChatType,
  FaceIndex,
  GrayTipElementSubType,
  Group,
  GroupMember,
  RawMessage,
  Sex,
  TipGroupElementType,
  User,
  SimpleInfo
} from '../ntqqapi/types'
import { EventType } from './event/OB11BaseEvent'
import { encodeCQCode } from './cqcode'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'
import { OB11GroupBanEvent } from './event/notice/OB11GroupBanEvent'
import { OB11GroupUploadNoticeEvent } from './event/notice/OB11GroupUploadNoticeEvent'
import { OB11GroupNoticeEvent } from './event/notice/OB11GroupNoticeEvent'
import { calcQQLevel } from '../common/utils/misc'
import { OB11GroupTitleEvent } from './event/notice/OB11GroupTitleEvent'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { OB11GroupMsgEmojiLikeEvent } from './event/notice/OB11MsgEmojiLikeEvent'
import { OB11FriendAddNoticeEvent } from './event/notice/OB11FriendAddNoticeEvent'
import { OB11FriendRecallNoticeEvent } from './event/notice/OB11FriendRecallNoticeEvent'
import { OB11GroupRecallNoticeEvent } from './event/notice/OB11GroupRecallNoticeEvent'
import { OB11FriendPokeEvent, OB11GroupPokeEvent } from './event/notice/OB11PokeEvent'
import { OB11BaseNoticeEvent } from './event/notice/OB11BaseNoticeEvent'
import { OB11GroupEssenceEvent } from './event/notice/OB11GroupEssenceEvent'
import { omit, pick, Dict } from 'cosmokit'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { pathToFileURL } from 'node:url'
import OneBot11Adapter from './adapter'

export namespace OB11Entities {
  export async function message(ctx: Context, msg: RawMessage): Promise<OB11Message | undefined> {
    if (!msg.senderUin || msg.senderUin === '0') return //跳过空消息
    const {
      debug,
      messagePostFormat,
    } = ctx.config as OneBot11Adapter.Config
    const selfUin = selfInfo.uin
    const msgShortId = ctx.store.createMsgShortId({ chatType: msg.chatType, peerUid: msg.peerUid }, msg.msgId)
    const resMsg: OB11Message = {
      self_id: parseInt(selfUin),
      user_id: parseInt(msg.senderUin),
      time: parseInt(msg.msgTime) || Date.now(),
      message_id: msgShortId,
      real_id: msgShortId,
      message_seq: msgShortId,
      message_type: msg.chatType === ChatType.Group ? 'group' : 'private',
      sender: {
        user_id: parseInt(msg.senderUin),
        nickname: msg.sendNickName,
        card: msg.sendMemberName ?? '',
      },
      raw_message: '',
      font: 14,
      sub_type: 'friend',
      message: messagePostFormat === 'string' ? '' : [],
      message_format: messagePostFormat === 'string' ? 'string' : 'array',
      post_type: selfUin == msg.senderUin ? EventType.MESSAGE_SENT : EventType.MESSAGE,
    }
    if (debug) {
      resMsg.raw = msg
    }
    if (msg.chatType === ChatType.Group) {
      resMsg.sub_type = 'normal'
      resMsg.group_id = parseInt(msg.peerUin)
      const member = await ctx.ntGroupApi.getGroupMember(msg.peerUin, msg.senderUid)
      if (member) {
        resMsg.sender.role = groupMemberRole(member.role)
        resMsg.sender.nickname = member.nick
        resMsg.sender.title = member.memberSpecialTitle ?? ''
      }
    }
    else if (msg.chatType === ChatType.C2C) {
      resMsg.sub_type = 'friend'
      resMsg.sender.nickname = (await ctx.ntUserApi.getUserSimpleInfo(msg.senderUid)).nick
    }
    else if (msg.chatType === ChatType.TempC2CFromGroup) {
      resMsg.sub_type = 'group'
      resMsg.temp_source = 0 //群聊
      resMsg.sender.nickname = (await ctx.ntUserApi.getUserSimpleInfo(msg.senderUid)).nick
      const ret = await ctx.ntMsgApi.getTempChatInfo(ChatType.TempC2CFromGroup, msg.senderUid)
      if (ret?.result === 0) {
        resMsg.sender.group_id = Number(ret.tmpChatInfo?.groupCode)
      } else {
        resMsg.sender.group_id = 284840486 //兜底数据
      }
    }

    for (const element of msg.elements) {
      let messageSegment: OB11MessageData | undefined
      if (element.textElement && element.textElement?.atType !== AtType.Unknown) {
        let qq: string
        let name: string | undefined
        if (element.textElement.atType === AtType.All) {
          qq = 'all'
        } else {
          const { atNtUid, atUid, content } = element.textElement
          if (atUid && atUid !== '0') {
            qq = atUid
          } else {
            qq = await ctx.ntUserApi.getUinByUid(atNtUid)
          }
          name = content.replace('@', '')
        }
        messageSegment = {
          type: OB11MessageDataType.at,
          data: {
            qq,
            name
          }
        }
      }
      else if (element.textElement) {
        const text = element.textElement.content
        if (!text) {
          continue
        }
        messageSegment = {
          type: OB11MessageDataType.text,
          data: {
            text
          }
        }
      }
      else if (element.replyElement) {
        const { replyElement } = element
        const peer = {
          chatType: msg.chatType,
          peerUid: msg.peerUid,
          guildId: ''
        }
        try {
          const { replayMsgSeq, replyMsgTime } = replyElement
          const records = msg.records.find(msgRecord => msgRecord.msgId === replyElement.sourceMsgIdInRecords)
          const senderUid = replyElement.senderUidStr || records?.senderUid
          if (!records || !replyMsgTime || !senderUid) {
            throw new Error('找不到回复消息')
          }
          const { msgList } = await ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, replayMsgSeq, replyMsgTime, [senderUid])

          let replyMsg: RawMessage | undefined
          if (records.msgRandom !== '0') {
            replyMsg = msgList.find(msg => msg.msgRandom === records.msgRandom)
          } else {
            ctx.logger.info('msgRandom is missing', replyElement, records)
            replyMsg = msgList[0]
          }

          // 284840486: 合并消息内侧 消息具体定位不到
          if (!replyMsg && msg.peerUin !== '284840486') {
            ctx.logger.info('queryMsgs', msgList.map(e => pick(e, ['msgSeq', 'msgRandom'])), records.msgRandom)
            throw new Error('回复消息验证失败')
          }
          messageSegment = {
            type: OB11MessageDataType.reply,
            data: {
              id: ctx.store.createMsgShortId(peer, replyMsg ? replyMsg.msgId : records.msgId).toString()
            }
          }
        } catch (e) {
          ctx.logger.error('获取不到引用的消息', replyElement, (e as Error).stack)
          continue
        }
      }
      else if (element.picElement) {
        const { picElement } = element
        const fileSize = picElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.image,
          data: {
            file: picElement.fileName,
            subType: picElement.picSubType,
            url: await ctx.ntFileApi.getImageUrl(picElement),
            file_size: fileSize,
          }
        }
        ctx.store.addFileCache({
          peerUid: msg.peerUid,
          msgId: msg.msgId,
          msgTime: +msg.msgTime,
          chatType: msg.chatType,
          elementId: element.elementId,
          elementType: element.elementType,
          fileName: picElement.fileName,
          fileUuid: picElement.fileUuid,
          fileSize,
        })
      }
      else if (element.videoElement) {
        const { videoElement } = element
        const videoUrl = await ctx.ntFileApi.getVideoUrl({
          chatType: msg.chatType,
          peerUid: msg.peerUid,
        }, msg.msgId, element.elementId)
        const fileSize = videoElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.video,
          data: {
            file: videoElement.fileName,
            url: videoUrl || pathToFileURL(videoElement.filePath).href,
            path: videoElement.filePath,
            file_size: fileSize,
          }
        }
        ctx.store.addFileCache({
          peerUid: msg.peerUid,
          msgId: msg.msgId,
          msgTime: +msg.msgTime,
          chatType: msg.chatType,
          elementId: element.elementId,
          elementType: element.elementType,
          fileName: videoElement.fileName,
          fileUuid: videoElement.fileUuid!,
          fileSize,
        })
      }
      else if (element.fileElement) {
        const { fileElement } = element
        const fileSize = fileElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.file,
          data: {
            file: fileElement.fileName,
            url: pathToFileURL(fileElement.filePath).href,
            file_id: fileElement.fileUuid,
            path: fileElement.filePath,
            file_size: fileSize,
          }
        }
        ctx.store.addFileCache({
          peerUid: msg.peerUid,
          msgId: msg.msgId,
          msgTime: +msg.msgTime,
          chatType: msg.chatType,
          elementId: element.elementId,
          elementType: element.elementType,
          fileName: fileElement.fileName,
          fileUuid: fileElement.fileUuid!,
          fileSize,
        })
      }
      else if (element.pttElement) {
        const { pttElement } = element
        const fileSize = pttElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.voice,
          data: {
            file: pttElement.fileName,
            url: pathToFileURL(pttElement.filePath).href,
            path: pttElement.filePath,
            file_size: fileSize,
          }
        }
        ctx.store.addFileCache({
          peerUid: msg.peerUid,
          msgId: msg.msgId,
          msgTime: +msg.msgTime,
          chatType: msg.chatType,
          elementId: element.elementId,
          elementType: element.elementType,
          fileName: pttElement.fileName,
          fileUuid: pttElement.fileUuid,
          fileSize,
        })
      }
      else if (element.arkElement) {
        const { arkElement } = element
        messageSegment = {
          type: OB11MessageDataType.json,
          data: {
            data: arkElement.bytesData
          }
        }
      }
      else if (element.faceElement) {
        const { faceElement } = element
        const { faceIndex, pokeType } = faceElement
        if (faceIndex === FaceIndex.Dice) {
          messageSegment = {
            type: OB11MessageDataType.dice,
            data: {
              result: faceElement.resultId!
            }
          }
        } else if (faceIndex === FaceIndex.RPS) {
          messageSegment = {
            type: OB11MessageDataType.RPS,
            data: {
              result: faceElement.resultId!
            }
          }
          /*} else if (faceIndex === 1 && pokeType === 1) {
            messageSegment = {
              type: OB11MessageDataType.shake,
              data: {}
            }*/
        } else {
          messageSegment = {
            type: OB11MessageDataType.face,
            data: {
              id: faceIndex.toString()
            }
          }
        }
      }
      else if (element.marketFaceElement) {
        const { marketFaceElement } = element
        const { emojiId } = marketFaceElement
        // 取md5的前两位
        const dir = emojiId.substring(0, 2)
        // 获取组装url
        // const url = `https://p.qpic.cn/CDN_STATIC/0/data/imgcache/htdocs/club/item/parcel/item/${dir}/${md5}/300x300.gif?max_age=31536000`
        const url = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw300.gif`
        messageSegment = {
          type: OB11MessageDataType.mface,
          data: {
            summary: marketFaceElement.faceName!,
            url,
            emoji_id: emojiId,
            emoji_package_id: marketFaceElement.emojiPackageId,
            key: marketFaceElement.key
          }
        }
      }
      else if (element.markdownElement) {
        const { markdownElement } = element
        messageSegment = {
          type: OB11MessageDataType.markdown,
          data: {
            data: markdownElement.content
          }
        }
      }
      else if (element.multiForwardMsgElement) {
        messageSegment = {
          type: OB11MessageDataType.forward,
          data: {
            id: msg.msgId
          }
        }
      }
      if (messageSegment) {
        const cqCode = encodeCQCode(messageSegment)
        if (messagePostFormat === 'array') {
          (resMsg.message as OB11MessageData[]).push(messageSegment)
        }
        resMsg.raw_message += cqCode
      }
    }
    if (messagePostFormat === 'string') {
      resMsg.message = resMsg.raw_message
    }
    return resMsg
  }

  export async function privateEvent(ctx: Context, msg: RawMessage): Promise<OB11BaseNoticeEvent | void> {
    if (msg.chatType !== ChatType.C2C) {
      return
    }
    for (const element of msg.elements) {
      if (element.grayTipElement) {
        const { grayTipElement } = element
        if (grayTipElement.jsonGrayTipElement?.busiId === '1061') {
          const json = JSON.parse(grayTipElement.jsonGrayTipElement.jsonStr)
          const pokedetail: Dict[] = json.items
          //筛选item带有uid的元素
          const poke_uid = pokedetail.filter(item => item.uid)
          if (poke_uid.length === 2) {
            return new OB11FriendPokeEvent(
              Number(await ctx.ntUserApi.getUinByUid(poke_uid[0].uid)),
              Number(await ctx.ntUserApi.getUinByUid(poke_uid[1].uid)),
              pokedetail
            )
          }
        }
        if (grayTipElement.xmlElement?.templId === '10229' || grayTipElement.jsonGrayTipElement?.busiId === '19324') {
          ctx.logger.info('收到好友添加消息', msg.peerUid)
          const uin = +msg.peerUin || +(await ctx.ntUserApi.getUinByUid(msg.peerUid))
          return new OB11FriendAddNoticeEvent(uin)
        }
      }
    }
  }

  export async function groupEvent(ctx: Context, msg: RawMessage): Promise<OB11GroupNoticeEvent | void> {
    if (msg.chatType !== ChatType.Group) {
      return
    }
    /**if (msg.senderUin) {
      const member = await ctx.ntGroupApi.getGroupMember(msg.peerUid, msg.senderUin)
      if (member && member.cardName !== msg.sendMemberName) {
        const event = new OB11GroupCardEvent(
          parseInt(msg.peerUid),
          parseInt(msg.senderUin),
          msg.sendMemberName!,
          member.cardName,
        )
        member.cardName = msg.sendMemberName!
        return event
      }
    }*/
    for (const element of msg.elements) {
      const grayTipElement = element.grayTipElement
      const groupElement = grayTipElement?.groupElement
      if (groupElement) {
        if (groupElement.type === TipGroupElementType.MemberIncrease) {
          ctx.logger.info('收到群成员增加消息', groupElement)
          const { memberUid, adminUid } = groupElement
          const memberUin = await ctx.ntUserApi.getUinByUid(memberUid)
          const operatorUin = adminUid ? await ctx.ntUserApi.getUinByUid(adminUid) : memberUin
          return new OB11GroupIncreaseEvent(+msg.peerUid, +memberUin, +operatorUin)
        }
        else if (groupElement.type === TipGroupElementType.Ban) {
          ctx.logger.info('收到群成员禁言提示', groupElement)
          const memberUid = groupElement.shutUp?.member.uid
          const adminUid = groupElement.shutUp?.admin.uid
          let memberUin: string = ''
          let duration = Number(groupElement.shutUp?.duration)
          const subType = duration > 0 ? 'ban' : 'lift_ban'
          if (memberUid) {
            memberUin =
              (await ctx.ntGroupApi.getGroupMember(msg.peerUid, memberUid))?.uin ||
              (await ctx.ntUserApi.getUserDetailInfo(memberUid))?.uin
          }
          else {
            memberUin = '0' // 0表示全员禁言
            if (duration > 0) {
              duration = -1
            }
          }
          const adminUin =
            (await ctx.ntGroupApi.getGroupMember(msg.peerUid, adminUid!))?.uin || (await ctx.ntUserApi.getUserDetailInfo(adminUid!))?.uin
          if (memberUin && adminUin) {
            return new OB11GroupBanEvent(
              parseInt(msg.peerUid),
              parseInt(memberUin),
              parseInt(adminUin),
              duration,
              subType,
            )
          }
        }
        else if (groupElement.type === TipGroupElementType.Kicked) {
          ctx.logger.info(`收到我被踢出或退群提示, 群${msg.peerUid}`, groupElement)
          ctx.ntGroupApi.quitGroup(msg.peerUid)
          try {
            const adminUin = (await ctx.ntGroupApi.getGroupMember(msg.peerUid, groupElement.adminUid))?.uin || (await ctx.ntUserApi.getUinByUid(groupElement.adminUid))
            if (adminUin) {
              return new OB11GroupDecreaseEvent(
                parseInt(msg.peerUid),
                parseInt(selfInfo.uin),
                parseInt(adminUin),
                'kick_me'
              )
            }
          } catch (e) {
            return new OB11GroupDecreaseEvent(
              parseInt(msg.peerUid),
              parseInt(selfInfo.uin),
              0,
              'leave'
            )
          }
        }
      }
      else if (element.fileElement) {
        return new OB11GroupUploadNoticeEvent(+msg.peerUid, +msg.senderUin!, {
          id: element.fileElement.fileUuid!,
          name: element.fileElement.fileName,
          size: parseInt(element.fileElement.fileSize),
          busid: element.fileElement.fileBizId || 0,
        })
      }

      if (grayTipElement) {
        const xmlElement = grayTipElement.xmlElement

        if (xmlElement?.templId === '10382') {
          const emojiLikeData = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
          }).parse(xmlElement.content)
          ctx.logger.info('收到表情回应我的消息', emojiLikeData)
          try {
            const senderUin: string = emojiLikeData.gtip.qq.jp
            const msgSeq: string = emojiLikeData.gtip.url.msgseq
            const emojiId: string = emojiLikeData.gtip.face.id
            const peer = {
              chatType: ChatType.Group,
              guildId: '',
              peerUid: msg.peerUid,
            }
            const replyMsgList = (await ctx.ntMsgApi.queryFirstMsgBySeq(peer, msgSeq)).msgList
            if (!replyMsgList?.length) {
              return
            }
            const shortId = ctx.store.createMsgShortId(peer, replyMsgList[0].msgId)
            return new OB11GroupMsgEmojiLikeEvent(
              parseInt(msg.peerUid),
              parseInt(senderUin),
              shortId,
              [{
                emoji_id: emojiId,
                count: 1,
              }]
            )
          } catch (e) {
            ctx.logger.error('解析表情回应消息失败', (e as Error).stack)
          }
        }

        if (
          grayTipElement.subElementType == GrayTipElementSubType.XmlMsg &&
          xmlElement?.templId == '10179'
        ) {
          ctx.logger.info('收到新人被邀请进群消息', grayTipElement)
          if (xmlElement?.content) {
            const regex = /jp="(\d+)"/g

            const matches: string[] = []
            let match: RegExpExecArray | null = null

            while ((match = regex.exec(xmlElement.content)) !== null) {
              matches.push(match[1])
            }
            if (matches.length === 2) {
              const [invitor, invitee] = matches
              return new OB11GroupIncreaseEvent(+msg.peerUid, +invitee, +invitor, 'invite')
            }
          }
        }
        else if (grayTipElement.subElementType == GrayTipElementSubType.JSON) {
          const json = JSON.parse(grayTipElement.jsonGrayTipElement!.jsonStr)
          if (grayTipElement.jsonGrayTipElement?.busiId === '1061') {
            const param = grayTipElement.jsonGrayTipElement.xmlToJsonParam
            if (param) {
              return new OB11GroupPokeEvent(
                Number(msg.peerUid),
                Number(param.templParam.get('uin_str1')),
                Number(param.templParam.get('uin_str2')),
                json.items
              )
            }
            const pokedetail: Dict[] = json.items
            //筛选item带有uid的元素
            const poke_uid = pokedetail.filter(item => item.uid)
            if (poke_uid.length == 2) {
              return new OB11GroupPokeEvent(
                Number(msg.peerUid),
                Number(await ctx.ntUserApi.getUinByUid(poke_uid[0].uid) ?? 0),
                Number(await ctx.ntUserApi.getUinByUid(poke_uid[1].uid) ?? 0),
                pokedetail
              )
            }
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '2401' && json.items[2]) {
            ctx.logger.info('收到群精华消息', json)
            const searchParams = new URL(json.items[2].jp).searchParams
            const msgSeq = searchParams.get('seq')
            const groupCode = searchParams.get('gc')
            const msgRandom = searchParams.get('random')
            if (!groupCode || !msgSeq || !msgRandom) return
            const peer = {
              guildId: '',
              chatType: ChatType.Group,
              peerUid: groupCode
            }
            const essence = await ctx.ntGroupApi.queryCachedEssenceMsg(groupCode, msgSeq, msgRandom)
            const { msgList } = await ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, msgSeq, '0')
            const sourceMsg = msgList.find(e => e.msgRandom === msgRandom)
            if (!sourceMsg) return
            return new OB11GroupEssenceEvent(
              parseInt(msg.peerUid),
              ctx.store.getShortIdByMsgInfo(peer, sourceMsg.msgId)!,
              parseInt(essence.items[0]?.msgSenderUin ?? sourceMsg.senderUin),
              parseInt(essence.items[0]?.opUin ?? '0'),
            )
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '2407') {
            const memberUin = json.items[1].param[0]
            const title = json.items[3].txt
            ctx.logger.info('收到群成员新头衔消息', json)
            return new OB11GroupTitleEvent(parseInt(msg.peerUid), parseInt(memberUin), title)
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '19217') {
            ctx.logger.info('收到新人被邀请进群消息', grayTipElement)
            const userId = new URL(json.items[2].jp).searchParams.get('robot_uin')
            const operatorId = new URL(json.items[0].jp).searchParams.get('uin')
            return new OB11GroupIncreaseEvent(Number(msg.peerUid), Number(userId), Number(operatorId), 'invite')
          }
        }
      }
    }
  }

  export async function recallEvent(
    ctx: Context,
    msg: RawMessage,
    shortId: number
  ): Promise<OB11FriendRecallNoticeEvent | OB11GroupRecallNoticeEvent | undefined> {
    const revokeElement = msg.elements[0].grayTipElement?.revokeElement
    if (msg.chatType === ChatType.Group) {
      const operator = await ctx.ntGroupApi.getGroupMember(msg.peerUid, revokeElement!.operatorUid)
      return new OB11GroupRecallNoticeEvent(
        parseInt(msg.peerUid),
        parseInt(msg.senderUin!),
        parseInt(operator?.uin || msg.senderUin!),
        shortId,
      )
    }
    else {
      return new OB11FriendRecallNoticeEvent(parseInt(msg.senderUin!), shortId)
    }
  }

  export function friend(friend: User): OB11User {
    return {
      user_id: parseInt(friend.uin),
      nickname: friend.nick,
      remark: friend.remark,
      sex: sex(friend.sex!),
      level: (friend.qqLevel && calcQQLevel(friend.qqLevel)) || 0,
    }
  }

  export function friends(friends: User[]): OB11User[] {
    return friends.map(friend)
  }

  export function friendV2(raw: SimpleInfo): OB11User {
    return {
      ...omit(raw.baseInfo, ['richBuffer', 'phoneNum']),
      ...omit(raw.coreInfo, ['nick']),
      user_id: parseInt(raw.coreInfo.uin),
      nickname: raw.coreInfo.nick,
      remark: raw.coreInfo.remark || raw.coreInfo.nick,
      sex: sex(raw.baseInfo.sex),
      level: 0
    }
  }

  export function friendsV2(raw: SimpleInfo[]): OB11User[] {
    return raw.map(friendV2)
  }

  export function groupMemberRole(role: number): OB11GroupMemberRole {
    return {
      4: OB11GroupMemberRole.Owner,
      3: OB11GroupMemberRole.Admin,
      2: OB11GroupMemberRole.Member,
    }[role] ?? OB11GroupMemberRole.Member
  }

  export function sex(sex: Sex): OB11UserSex {
    const sexMap = {
      [Sex.male]: OB11UserSex.Male,
      [Sex.female]: OB11UserSex.Female,
      [Sex.unknown]: OB11UserSex.Unknown,
    }
    return sexMap[sex] || OB11UserSex.Unknown
  }

  export function groupMember(group_id: string, member: GroupMember): OB11GroupMember {
    const titleExpireTime = +member.specialTitleExpireTime
    const int32Max = Math.pow(2, 31) - 1
    return {
      group_id: parseInt(group_id),
      user_id: parseInt(member.uin),
      nickname: member.nick,
      card: member.cardName || member.nick,
      sex: OB11UserSex.Unknown,
      age: 0,
      area: '',
      level: String(member.memberLevel ?? 0),
      qq_level: 0,
      join_time: member.joinTime,
      last_sent_time: member.lastSpeakTime,
      title_expire_time: titleExpireTime > int32Max ? 0 : titleExpireTime,
      unfriendly: false,
      card_changeable: true,
      is_robot: member.isRobot,
      shut_up_timestamp: member.shutUpTime,
      role: groupMemberRole(member.role),
      title: member.memberSpecialTitle,
    }
  }

  export function stranger(user: User): OB11User {
    return {
      ...user,
      user_id: parseInt(user.uin),
      nickname: user.nick,
      sex: sex(user.sex!),
      age: 0,
      qid: user.qid,
      login_days: 0,
      level: (user.qqLevel && calcQQLevel(user.qqLevel)) || 0,
    }
  }

  export function group(group: Group): OB11Group {
    return {
      group_id: parseInt(group.groupCode),
      group_name: group.groupName,
      group_memo: group.remarkName,
      group_create_time: +group.createTime,
      member_count: group.memberCount,
      max_member_count: group.maxMember,
    }
  }

  export function groups(groups: Group[]): OB11Group[] {
    return groups.map(group)
  }
}
