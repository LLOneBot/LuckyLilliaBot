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
  FaceIndex, FaceType,
  GrayTipElementSubType,
  GroupMember,
  GroupSimpleInfo,
  Peer,
  RawMessage,
  Sex,
  SimpleInfo,
  TipGroupElementType,
  User,
} from '../ntqqapi/types'
import { EventType } from './event/OB11BaseEvent'
import { encodeCQCode } from './cqcode'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'
import { OB11GroupUploadNoticeEvent } from './event/notice/OB11GroupUploadNoticeEvent'
import { OB11GroupNoticeEvent } from './event/notice/OB11GroupNoticeEvent'
import { calcQQLevel } from '../common/utils/misc'
import { OB11GroupTitleEvent } from './event/notice/OB11GroupTitleEvent'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { OB11FriendAddNoticeEvent } from './event/notice/OB11FriendAddNoticeEvent'
import { OB11FriendRecallNoticeEvent } from './event/notice/OB11FriendRecallNoticeEvent'
import { OB11GroupRecallNoticeEvent } from './event/notice/OB11GroupRecallNoticeEvent'
import { OB11FriendPokeEvent, OB11GroupPokeEvent } from './event/notice/OB11PokeEvent'
import { OB11BaseNoticeEvent } from './event/notice/OB11BaseNoticeEvent'
import { OB11GroupRequestEvent } from './event/request/OB11GroupRequest'
import { GroupBanEvent } from './event/notice/OB11GroupBanEvent'
import { GroupMsgEmojiLikeEvent } from './event/notice/OB11MsgEmojiLikeEvent'
import { GroupEssenceEvent } from './event/notice/OB11GroupEssenceEvent'
import { Dict, omit, pick } from 'cosmokit'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { pathToFileURL } from 'node:url'
import OneBot11Adapter from './adapter'

export namespace OB11Entities {
  export async function message(
    ctx: Context,
    msg: RawMessage,
    rootMsgID?: string,
    peer?: Peer,
  ): Promise<OB11Message | undefined> {
    if (!msg.senderUin || msg.senderUin === '0' || msg.msgType === 1) return //跳过空消息
    const {
      debug,
      messagePostFormat,
    } = ctx.config as OneBot11Adapter.Config
    const selfUin = selfInfo.uin
    const msgShortId = ctx.store.createMsgShortId({ chatType: msg.chatType, peerUid: msg.peerUid }, msg.msgId)
    const resMsg: OB11Message = {
      self_id: Number(selfUin),
      user_id: Number(msg.senderUin),
      time: Number(msg.msgTime),
      message_id: msgShortId,
      message_seq: Number(msg.msgSeq),
      message_type: msg.chatType === ChatType.Group ? 'group' : 'private',
      sender: {
        user_id: Number(msg.senderUin),
        nickname: msg.sendNickName,
        card: msg.sendMemberName ?? '',
      },
      raw_message: '',
      font: 14,
      sub_type: 'friend',
      message: messagePostFormat === 'string' ? '' : [],
      message_format: messagePostFormat === 'string' ? 'string' : 'array',
      post_type: selfUin === msg.senderUin ? EventType.MESSAGE_SENT : EventType.MESSAGE,
    }
    if (debug) {
      resMsg.raw = msg
    }
    if (msg.chatType === ChatType.Group) {
      resMsg.sub_type = 'normal'
      resMsg.group_id = parseInt(msg.peerUin)
      // 284840486: 合并转发内部
      if (msg.peerUin !== '284840486') {
        try {
          const member = await ctx.ntGroupApi.getGroupMember(msg.peerUin, msg.senderUid)
          resMsg.sender.role = groupMemberRole(member.role)
          resMsg.sender.nickname = member.nick
          resMsg.sender.title = member.memberSpecialTitle ?? ''
        } catch {
          resMsg.sender.role = OB11GroupMemberRole.Member
          resMsg.sender.title = ''
        }
      }
    }
    else if (msg.chatType === ChatType.C2C) {
      resMsg.sub_type = 'friend'
      resMsg.sender.nickname = (await ctx.ntUserApi.getUserSimpleInfo(msg.senderUid)).coreInfo.nick
    }
    else if (msg.chatType === ChatType.TempC2CFromGroup) {
      resMsg.sub_type = 'group'
      resMsg.temp_source = 0 //群聊
      resMsg.sender.nickname = (await ctx.ntUserApi.getUserSimpleInfo(msg.senderUid)).coreInfo.nick
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
          type: OB11MessageDataType.At,
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
          type: OB11MessageDataType.Text,
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
          const record = msg.records.find(msgRecord => msgRecord.msgId === replyElement.sourceMsgIdInRecords)
          const senderUid = replyElement.senderUidStr || record?.senderUid
          if (!record || !replyMsgTime || !senderUid) {
            ctx.logger.error('找不到回复消息')
            continue
          }
          const { msgList } = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, replayMsgSeq, 1, true, true)

          let replyMsg: RawMessage | undefined
          if (record.msgRandom !== '0') {
            replyMsg = msgList.find((msg: RawMessage) => msg.msgRandom === record.msgRandom)
          } else {
            ctx.logger.info('msgRandom is missing', replyElement, record)
            replyMsg = msgList[0]
          }
          if (!replyMsg) {
            ctx.logger.error('获取不到引用的消息', replyElement)
            continue
          }
          // 284840486: 合并消息内侧 消息具体定位不到
          if (!replyMsg && msg.peerUin !== '284840486') {
            ctx.logger.error('获取不到引用的消息', replyElement)
            ctx.logger.warn('queryMsgs', msgList.map(e => pick(e, ['msgSeq', 'msgRandom'])), record.msgRandom)
            continue
          }

          messageSegment = {
            type: OB11MessageDataType.Reply,
            data: {
              id: ctx.store.createMsgShortId(peer, replyMsg ? replyMsg.msgId : record.msgId).toString()
            }
          }
        } catch (e) {
          ctx.logger.error('获取不到引用的消息', e, replyElement, (e as Error).stack)
          continue
        }
      }
      else if (element.picElement) {
        const { picElement } = element
        const fileSize = picElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.Image,
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
        }).then()
      }
      else if (element.videoElement) {
        const { videoElement } = element
        const videoUrl = await ctx.ntFileApi.getVideoUrl(
          {
            chatType: msg.chatType,
            peerUid: peer?.peerUid ?? msg.peerUid,
          },
          rootMsgID ?? msg.msgId,
          element.elementId,
        )
        const fileSize = videoElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.Video,
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
        }).then()
      }
      else if (element.fileElement) {
        const { fileElement } = element
        const fileSize = fileElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.File,
          data: {
            file: fileElement.fileName,
            url: fileElement.filePath ? pathToFileURL(fileElement.filePath).href : '',
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
        }).then()
      }
      else if (element.pttElement) {
        const { pttElement } = element
        const fileSize = pttElement.fileSize ?? '0'
        messageSegment = {
          type: OB11MessageDataType.Record,
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
        }).then()
      }
      else if (element.arkElement) {
        const { arkElement } = element
        messageSegment = {
          type: OB11MessageDataType.Json,
          data: {
            data: arkElement.bytesData
          }
        }
      }
      else if (element.faceElement) {
        const { faceElement } = element
        const { faceIndex, faceType } = faceElement
        if (faceType === FaceType.Poke && faceIndex === 1) {
          messageSegment = {
            type: OB11MessageDataType.Shake,
            data: {}
          }
        }
        else {
          if (faceIndex === FaceIndex.Dice) {
            messageSegment = {
              type: OB11MessageDataType.Dice,
              data: {
                result: faceElement.resultId!
              }
            }
          }
          else if (faceIndex === FaceIndex.RPS) {
            messageSegment = {
              type: OB11MessageDataType.Rps,
              data: {
                result: faceElement.resultId!
              }
            }
            /*} else if (faceIndex === 1 && pokeType === 1) {
              messageSegment = {
                type: OB11MessageDataType.shake,
                data: {}
              }*/
          }
          else {
            messageSegment = {
              type: OB11MessageDataType.Face,
              data: {
                id: faceIndex.toString(),
                sub_type: faceType
              }
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
          type: OB11MessageDataType.Mface,
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
        // todo: 解析闪传 markdown 获取 fileSetId
        if (markdownElement?.content.startsWith('[闪传](')) {
          const mqqapiUrl = markdownElement?.content.substring(5, markdownElement?.content.length - 1)
          const urlJson = new URL(mqqapiUrl).searchParams.get('json')
          if (urlJson) {
            const jsonData = JSON.parse(urlJson)
            const busId = jsonData?.busId
            if (busId === 'FlashTransfer') {
              const attributes: any[] = jsonData?.attributes?.attributes || []
              const fileAttribute = attributes.find(a => a.viewId === 'file')
              if (fileAttribute) {
                const urlParams = new URL(fileAttribute.schema).searchParams
                const fileSetId = urlParams.get('fileset_id') || ''
                const sceneType = urlParams.get('scene_type') || ''
                const fileSubAttributes: any[] = fileAttribute?.attributes || []
                const titleAttribute = fileSubAttributes.find(a => a.viewId === 'title')
                const title: string = titleAttribute?.text
                messageSegment = {
                  type: OB11MessageDataType.FlashFile,
                  data: {
                    title,
                    file_set_id: fileSetId,
                    scene_type: parseInt(sceneType)
                  }
                }
              }
            }
          }
        }
        else {
          messageSegment = {
            type: OB11MessageDataType.Markdown,
            data: {
              content: markdownElement.content
            }
          }
        }
      }
      else if (element.multiForwardMsgElement) {
        messageSegment = {
          type: OB11MessageDataType.Forward,
          data: {
            id: msg.msgId
          }
        }
      } else if (element.inlineKeyboardElement) {
        messageSegment = {
          type: OB11MessageDataType.Keyboard,
          data: {
            rows: element.inlineKeyboardElement.rows.map(row => ({
              buttons: row.buttons.map(button => ({
                id: button.id,
                render_data: {
                  label: button.label,
                  visited_label: button.visitedLabel,
                  style: button.style,
                },
                action: {
                  type: button.type,
                  permission: {
                    type: button.permissionType,
                    specify_role_ids: button.specifyRoleIds,
                    specify_user_ids: button.specifyTinyids,
                  },
                  unsupport_tips: button.unsupportTips,
                  data: button.data,
                  reply: button.isReply,
                  enter: button.enter,
                },
              }))
            }))
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
    if (msg.msgType !== 5 && msg.msgType !== 11) {
      return
    }

    for (const element of msg.elements) {
      if (element.grayTipElement) {
        const { grayTipElement } = element
        if (grayTipElement.jsonGrayTipElement?.busiId === '1061') {
          const json = JSON.parse(grayTipElement.jsonGrayTipElement.jsonStr)
          const param = grayTipElement.jsonGrayTipElement.xmlToJsonParam
          if (param) {
            return new OB11FriendPokeEvent(
              Number(param.templParam.get('uin_str1')),
              Number(param.templParam.get('uin_str2')),
              json.items
            )
          }
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
      } else if (element.arkElement) {
        const data = JSON.parse(element.arkElement.bytesData)
        if (data.app === 'com.tencent.qun.invite' || (data.app === 'com.tencent.tuwen.lua' && data.bizsrc === 'qun.invite')) {
          const params = new URLSearchParams(data.meta.news.jumpUrl)
          const receiverUin = params.get('receiveruin')
          const senderUin = params.get('senderuin')
          if (receiverUin !== selfInfo.uin || senderUin !== msg.senderUin) {
            return
          }
          ctx.logger.info('收到邀请我加群消息')
          const groupCode = params.get('groupcode')
          const seq = params.get('msgseq')
          const flag = `${groupCode}|${seq}|1|0`
          return new OB11GroupRequestEvent(
            Number(groupCode),
            Number(senderUin),
            flag,
            data.meta.news.desc,
            'invite',
          )
        }
      }
    }
  }

  export async function groupEvent(ctx: Context, msg: RawMessage): Promise<OB11GroupNoticeEvent | void> {
    if (msg.chatType !== ChatType.Group) {
      return
    }
    if (msg.msgType !== 5 && msg.msgType !== 3) {
      return
    }

    for (const element of msg.elements) {
      if (element.fileElement) {
        return new OB11GroupUploadNoticeEvent(+msg.peerUid, +msg.senderUin!, {
          id: element.fileElement.fileUuid!,
          name: element.fileElement.fileName,
          size: parseInt(element.fileElement.fileSize),
          busid: element.fileElement.fileBizId || 0,
        })
      } else if (element.grayTipElement) {
        const grayTipElement = element.grayTipElement
        if (grayTipElement.subElementType === GrayTipElementSubType.JSON) {
          const json = JSON.parse(grayTipElement.jsonGrayTipElement!.jsonStr)
          if (grayTipElement.jsonGrayTipElement?.busiId === '1061') {
            const param = grayTipElement.jsonGrayTipElement.xmlToJsonParam!
            return new OB11GroupPokeEvent(
              Number(msg.peerUid),
              Number(param.templParam.get('uin_str1')),
              Number(param.templParam.get('uin_str2')),
              json.items
            )
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '2401' && json.items[2]) {
            ctx.logger.info('收到群精华消息', json)
            return await GroupEssenceEvent.parse(ctx, new URL(json.items[2].jp))
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '2407') {
            ctx.logger.info('收到群成员新头衔消息', json)
            const memberUin = json.items[1].param[0]
            const title = json.items[3].txt
            return new OB11GroupTitleEvent(parseInt(msg.peerUid), parseInt(memberUin), title)
          } else if (grayTipElement.jsonGrayTipElement?.busiId === '19217') {
            ctx.logger.info('收到新人被邀请进群消息', grayTipElement)
            const userId = new URL(json.items[2].jp).searchParams.get('robot_uin')
            const operatorId = new URL(json.items[0].jp).searchParams.get('uin')
            return new OB11GroupIncreaseEvent(Number(msg.peerUid), Number(userId), Number(operatorId), 'invite')
          }
        } else if (grayTipElement.subElementType === GrayTipElementSubType.Group) {
          const groupElement = grayTipElement.groupElement!
          if (groupElement.type === TipGroupElementType.Ban) {
            ctx.logger.info('收到群成员禁言提示', groupElement)
            return await GroupBanEvent.parse(ctx, groupElement, msg.peerUid)
          } else if (groupElement.type === TipGroupElementType.Kicked) {
            ctx.logger.info(`收到我被踢出或退群提示, 群${msg.peerUid}`, groupElement)
            const { adminUid } = groupElement
            return new OB11GroupDecreaseEvent(
              Number(msg.peerUid),
              Number(selfInfo.uin),
              adminUid ? Number(await ctx.ntUserApi.getUinByUid(adminUid)) : 0,
              adminUid ? 'kick_me' : 'leave'
            )
          } else if (groupElement.type === TipGroupElementType.MemberIncrease) {
            const { memberUid, adminUid } = groupElement
            if (memberUid !== selfInfo.uid) return
            ctx.logger.info('收到群成员增加消息', groupElement)
            const adminUin = adminUid ? await ctx.ntUserApi.getUinByUid(adminUid) : selfInfo.uin
            return new OB11GroupIncreaseEvent(+msg.peerUid, +selfInfo.uin, +adminUin)
          }
        } else if (grayTipElement.subElementType === GrayTipElementSubType.XmlMsg) {
          const xmlElement = grayTipElement.xmlElement!
          if (xmlElement.templId === '10382') {
            ctx.logger.info('收到表情回应我的消息', xmlElement.templParam)
            return await GroupMsgEmojiLikeEvent.parse(ctx, xmlElement, msg.peerUid)
          } else if (xmlElement.templId == '10179') {
            ctx.logger.info('收到新人被邀请进群消息 templId: 10179', xmlElement)
            const invitor = xmlElement.templParam.get('invitor')
            const invitee = xmlElement.templParam.get('invitee')
            if (invitor && invitee) {
              return new OB11GroupIncreaseEvent(+msg.peerUid, +invitee, +invitor, 'invite')
            }
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
      [Sex.Unknown]: OB11UserSex.Unknown,
      [Sex.Male]: OB11UserSex.Male,
      [Sex.Female]: OB11UserSex.Female,
      [Sex.Hidden]: OB11UserSex.Unknown
    }
    return sexMap[sex] ?? OB11UserSex.Unknown
  }

  export function groupMember(groupId: number, member: GroupMember): OB11GroupMember {
    return {
      group_id: groupId,
      user_id: parseInt(member.uin),
      nickname: member.nick,
      card: member.cardName || member.nick,
      sex: OB11UserSex.Unknown,
      age: 0,
      area: '',
      level: String(member.memberRealLevel ?? 0),
      qq_level: 0,
      join_time: member.joinTime,
      last_sent_time: member.lastSpeakTime,
      title_expire_time: 0,
      unfriendly: false,
      card_changeable: true,
      is_robot: member.isRobot,
      shut_up_timestamp: member.shutUpTime,
      role: groupMemberRole(member.role),
      title: member.memberSpecialTitle,
    }
  }

  export function group(group: GroupSimpleInfo): OB11Group {
    return {
      group_id: parseInt(group.groupCode),
      group_name: group.groupName,
      group_memo: '',
      group_create_time: +group.createTime,
      member_count: group.memberCount,
      max_member_count: group.maxMember,
      remark_name: group.remarkName,
    }
  }

  export function groups(groups: GroupSimpleInfo[]): OB11Group[] {
    return groups.map(group)
  }
}
