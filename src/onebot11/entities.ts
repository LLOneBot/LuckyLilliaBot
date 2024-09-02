import fastXmlParser from 'fast-xml-parser'
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
  Peer,
  GroupMember,
  RawMessage,
  Sex,
  TipGroupElementType,
  User,
  FriendV2,
  ChatType2
} from '../ntqqapi/types'
import { EventType } from './event/OB11BaseEvent'
import { encodeCQCode } from './cqcode'
import { MessageUnique } from '../common/utils/messageUnique'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'
import { OB11GroupBanEvent } from './event/notice/OB11GroupBanEvent'
import { OB11GroupUploadNoticeEvent } from './event/notice/OB11GroupUploadNoticeEvent'
import { OB11GroupNoticeEvent } from './event/notice/OB11GroupNoticeEvent'
import { calcQQLevel } from '../common/utils/misc'
import { getConfigUtil } from '../common/config'
import { OB11GroupTitleEvent } from './event/notice/OB11GroupTitleEvent'
import { OB11GroupCardEvent } from './event/notice/OB11GroupCardEvent'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { OB11GroupMsgEmojiLikeEvent } from './event/notice/OB11MsgEmojiLikeEvent'
import { OB11FriendAddNoticeEvent } from './event/notice/OB11FriendAddNoticeEvent'
import { OB11FriendRecallNoticeEvent } from './event/notice/OB11FriendRecallNoticeEvent'
import { OB11GroupRecallNoticeEvent } from './event/notice/OB11GroupRecallNoticeEvent'
import { OB11FriendPokeEvent, OB11GroupPokeEvent } from './event/notice/OB11PokeEvent'
import { OB11BaseNoticeEvent } from './event/notice/OB11BaseNoticeEvent'
import { OB11GroupEssenceEvent } from './event/notice/OB11GroupEssenceEvent'
import { omit, isNullable } from 'cosmokit'
import { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { pathToFileURL } from 'node:url'

export namespace OB11Entities {
  export async function message(ctx: Context, msg: RawMessage): Promise<OB11Message> {
    let config = getConfigUtil().getConfig()
    const {
      debug,
      ob11: { messagePostFormat },
    } = config
    const selfUin = selfInfo.uin
    const resMsg: OB11Message = {
      self_id: parseInt(selfUin),
      user_id: parseInt(msg.senderUin!),
      time: parseInt(msg.msgTime) || Date.now(),
      message_id: msg.msgShortId!,
      real_id: msg.msgShortId!,
      message_seq: msg.msgShortId!,
      message_type: msg.chatType === ChatType.group ? 'group' : 'private',
      sender: {
        user_id: parseInt(msg.senderUin!),
        nickname: msg.sendNickName,
        card: msg.sendMemberName || '',
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
    if (msg.chatType == ChatType.group) {
      resMsg.sub_type = 'normal'
      resMsg.group_id = parseInt(msg.peerUin)
      const member = await ctx.ntGroupApi.getGroupMember(msg.peerUin, msg.senderUin!)
      if (member) {
        resMsg.sender.role = groupMemberRole(member.role)
        resMsg.sender.nickname = member.nick
      }
    }
    else if (msg.chatType == ChatType.friend) {
      resMsg.sub_type = 'friend'
      resMsg.sender.nickname = (await ctx.ntUserApi.getUserDetailInfo(msg.senderUid)).nick
    }
    else if (msg.chatType as unknown as ChatType2 == ChatType2.KCHATTYPETEMPC2CFROMGROUP) {
      resMsg.sub_type = 'group'
      const ret = await ctx.ntMsgApi.getTempChatInfo(ChatType2.KCHATTYPETEMPC2CFROMGROUP, msg.senderUid)
      if (ret?.result === 0) {
        resMsg.group_id = parseInt(ret.tmpChatInfo!.groupCode)
        resMsg.sender.nickname = ret.tmpChatInfo!.fromNick
      } else {
        resMsg.group_id = 284840486 //兜底数据
        resMsg.sender.nickname = '临时会话'
      }
    }

    for (let element of msg.elements) {
      let messageSegment: OB11MessageData | undefined
      if (element.textElement && element.textElement?.atType !== AtType.notAt) {
        let qq: string
        let name: string | undefined
        if (element.textElement.atType == AtType.atAll) {
          qq = 'all'
        }
        else {
          const { atNtUid, content } = element.textElement
          let atQQ = element.textElement.atUid
          if (!atQQ || atQQ === '0') {
            const atMember = await ctx.ntGroupApi.getGroupMember(msg.peerUin, atNtUid)
            if (atMember) {
              atQQ = atMember.uin
            }
          }
          if (atQQ) {
            qq = atQQ
            name = content.replace('@', '')
          }
        }
        messageSegment = {
          type: OB11MessageDataType.at,
          data: {
            qq: qq!,
            name
          }
        }
      }
      else if (element.textElement) {
        const text = element.textElement.content
        if (!text.trim()) {
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
          const records = msg.records.find(msgRecord => msgRecord.msgId === replyElement.sourceMsgIdInRecords)
          if (!records) throw new Error('找不到回复消息')
          let replyMsg = (await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, replyElement.replayMsgSeq, 1, true, true)).msgList[0]
          if (!replyMsg || records.msgRandom !== replyMsg.msgRandom) {
            replyMsg = (await ctx.ntMsgApi.getSingleMsg(peer, replyElement.replayMsgSeq)).msgList[0]
          }
          // 284840486: 合并消息内侧 消息具体定位不到
          if ((!replyMsg || records.msgRandom !== replyMsg.msgRandom) && msg.peerUin !== '284840486') {
            throw new Error('回复消息消息验证失败')
          }
          messageSegment = {
            type: OB11MessageDataType.reply,
            data: {
              id: MessageUnique.createMsg(peer, replyMsg ? replyMsg.msgId : records.msgId).toString()
            }
          }
        } catch (e: any) {
          ctx.logger.error('获取不到引用的消息', replyElement.replayMsgSeq, e.stack)
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
        MessageUnique.addFileCache({
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
        MessageUnique.addFileCache({
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
        MessageUnique.addFileCache({
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
        MessageUnique.addFileCache({
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
        const faceId = faceElement.faceIndex
        if (faceId === FaceIndex.dice) {
          messageSegment = {
            type: OB11MessageDataType.dice,
            data: {
              result: faceElement.resultId!
            }
          }
        }
        else if (faceId === FaceIndex.RPS) {
          messageSegment = {
            type: OB11MessageDataType.RPS,
            data: {
              result: faceElement.resultId!
            }
          }
        }
        else {
          messageSegment = {
            type: OB11MessageDataType.face,
            data: {
              id: faceId.toString()
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
        //mFaceCache.set(emojiId, element.marketFaceElement.faceName!)
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
        if (messagePostFormat === 'string') {
          (resMsg.message as string) += cqCode
        } else {
          (resMsg.message as OB11MessageData[]).push(messageSegment)
        }
        resMsg.raw_message += cqCode
      }
    }
    resMsg.raw_message = resMsg.raw_message.trim()
    return resMsg
  }

  export async function privateEvent(ctx: Context, msg: RawMessage): Promise<OB11BaseNoticeEvent | void> {
    if (msg.chatType !== ChatType.friend) {
      return
    }
    for (const element of msg.elements) {
      if (element.grayTipElement) {
        if (element.grayTipElement.subElementType == GrayTipElementSubType.MEMBER_NEW_TITLE) {
          const json = JSON.parse(element.grayTipElement.jsonGrayTipElement.jsonStr)
          if (element.grayTipElement.jsonGrayTipElement.busiId == 1061) {
            //判断业务类型
            //Poke事件
            const pokedetail: any[] = json.items
            //筛选item带有uid的元素
            const poke_uid = pokedetail.filter(item => item.uid)
            if (poke_uid.length == 2) {
              return new OB11FriendPokeEvent(
                parseInt(await ctx.ntUserApi.getUinByUid(poke_uid[0].uid)),
                parseInt(await ctx.ntUserApi.getUinByUid(poke_uid[1].uid)),
                pokedetail
              )
            }
          }
          //下面得改 上面也是错的grayTipElement.subElementType == GrayTipElementSubType.MEMBER_NEW_TITLE
        }
      }
    }
    // 好友增加事件
    if (msg.msgType === 5 && msg.subMsgType === 12) {
      const event = new OB11FriendAddNoticeEvent(parseInt(msg.peerUin))
      return event
    }
  }

  export async function groupEvent(ctx: Context, msg: RawMessage): Promise<OB11GroupNoticeEvent | void> {
    if (msg.chatType !== ChatType.group) {
      return
    }
    if (msg.senderUin) {
      let member = await ctx.ntGroupApi.getGroupMember(msg.peerUid, msg.senderUin)
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
    }
    // log("group msg", msg)
    for (let element of msg.elements) {
      const grayTipElement = element.grayTipElement
      const groupElement = grayTipElement?.groupElement
      if (groupElement) {
        // log("收到群提示消息", groupElement)
        if (groupElement.type === TipGroupElementType.memberIncrease) {
          ctx.logger.info('收到群成员增加消息', groupElement)
          await ctx.sleep(1000)
          const member = await ctx.ntGroupApi.getGroupMember(msg.peerUid, groupElement.memberUid)
          let memberUin = member?.uin
          if (!memberUin) {
            memberUin = (await ctx.ntUserApi.getUserDetailInfo(groupElement.memberUid)).uin
          }
          // log("获取新群成员QQ", memberUin)
          const adminMember = await ctx.ntGroupApi.getGroupMember(msg.peerUid, groupElement.adminUid)
          // log("获取同意新成员入群的管理员", adminMember)
          if (memberUin) {
            const operatorUin = adminMember?.uin || memberUin
            let event = new OB11GroupIncreaseEvent(parseInt(msg.peerUid), parseInt(memberUin), parseInt(operatorUin))
            // log("构造群增加事件", event)
            return event
          }
        }
        else if (groupElement.type === TipGroupElementType.ban) {
          ctx.logger.info('收到群群员禁言提示', groupElement)
          const memberUid = groupElement.shutUp?.member.uid
          const adminUid = groupElement.shutUp?.admin.uid
          let memberUin: string = ''
          let duration = parseInt(groupElement.shutUp?.duration!)
          let sub_type: 'ban' | 'lift_ban' = duration > 0 ? 'ban' : 'lift_ban'
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
              sub_type,
            )
          }
        }
        else if (groupElement.type === TipGroupElementType.kicked) {
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
        return new OB11GroupUploadNoticeEvent(parseInt(msg.peerUid), parseInt(msg.senderUin!), {
          id: element.fileElement.fileUuid!,
          name: element.fileElement.fileName,
          size: parseInt(element.fileElement.fileSize),
          busid: element.fileElement.fileBizId || 0,
        })
      }

      if (grayTipElement) {
        const xmlElement = grayTipElement.xmlElement

        if (xmlElement?.templId === '10382') {
          // 表情回应消息
          // "content":
          //  "<gtip align=\"center\">
          //    <qq uin=\"u_snYxnEfja-Po_\" col=\"3\" jp=\"3794\"/>
          //    <nor txt=\"回应了你的\"/>
          //    <url jp= \"\" msgseq=\"74711\" col=\"3\" txt=\"消息:\"/>
          //    <face type=\"1\" id=\"76\">  </face>
          //  </gtip>",
          const emojiLikeData = new fastXmlParser.XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
          }).parse(xmlElement.content)
          ctx.logger.info('收到表情回应我的消息', emojiLikeData)
          try {
            const senderUin = emojiLikeData.gtip.qq.jp
            const msgSeq = emojiLikeData.gtip.url.msgseq
            const emojiId = emojiLikeData.gtip.face.id
            const replyMsgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount({
              chatType: ChatType.group,
              guildId: '',
              peerUid: msg.peerUid,
            }, msgSeq, 1, true, true))?.msgList
            if (!replyMsgList?.length) {
              return
            }
            const likes = [
              {
                emoji_id: emojiId,
                count: 1,
              },
            ]
            const shortId = MessageUnique.getShortIdByMsgId(replyMsgList[0].msgId)
            return new OB11GroupMsgEmojiLikeEvent(
              parseInt(msg.peerUid),
              parseInt(senderUin),
              shortId!,
              likes
            )
          } catch (e: any) {
            ctx.logger.error('解析表情回应消息失败', e.stack)
          }
        }

        if (
          grayTipElement.subElementType == GrayTipElementSubType.INVITE_NEW_MEMBER &&
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
            // log("新人进群匹配到的QQ号", matches)
            if (matches.length === 2) {
              const [inviter, invitee] = matches
              return new OB11GroupIncreaseEvent(parseInt(msg.peerUid), parseInt(invitee), parseInt(inviter), 'invite')
            }
          }
        }
        else if (grayTipElement.subElementType == GrayTipElementSubType.MEMBER_NEW_TITLE) {
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
          if (grayTipElement.jsonGrayTipElement.busiId == 1061) {
            //判断业务类型
            //Poke事件
            const pokedetail: any[] = json.items
            //筛选item带有uid的元素
            const poke_uid = pokedetail.filter(item => item.uid)
            if (poke_uid.length == 2) {
              return new OB11GroupPokeEvent(
                parseInt(msg.peerUid),
                parseInt(await ctx.ntUserApi.getUinByUid(poke_uid[0].uid)),
                parseInt(await ctx.ntUserApi.getUinByUid(poke_uid[1].uid)),
                pokedetail
              )
            }
          }
          if (grayTipElement.jsonGrayTipElement.busiId == 2401) {
            ctx.logger.info('收到群精华消息', json)
            const searchParams = new URL(json.items[0].jp).searchParams
            const msgSeq = searchParams.get('msgSeq')!
            const Group = searchParams.get('groupCode')
            const Peer: Peer = {
              guildId: '',
              chatType: ChatType.group,
              peerUid: Group!
            }
            const msgList = (await ctx.ntMsgApi.getMsgsBySeqAndCount(Peer, msgSeq.toString(), 1, true, true))?.msgList
            if (!msgList?.length) {
              return
            }
            //const origMsg = await dbUtil.getMsgByLongId(msgList[0].msgId)
            //const postMsg = await dbUtil.getMsgBySeqId(origMsg?.msgSeq!) ?? origMsg
            // 如果 senderUin 为 0，可能是 历史消息 或 自身消息
            //if (msgList[0].senderUin === '0') {
            //msgList[0].senderUin = postMsg?.senderUin ?? getSelfUin()
            //}
            return new OB11GroupEssenceEvent(
              parseInt(msg.peerUid),
              MessageUnique.getShortIdByMsgId(msgList[0].msgId)!,
              parseInt(msgList[0].senderUin!)
            )
            // 获取MsgSeq+Peer可获取具体消息
          }
          if (grayTipElement.jsonGrayTipElement.busiId == 2407) {
            const memberUin = json.items[1].param[0]
            const title = json.items[3].txt
            ctx.logger.info('收到群成员新头衔消息', json)
            ctx.ntGroupApi.getGroupMember(msg.peerUid, memberUin).then(member => {
              if (!isNullable(member)) {
                member.memberSpecialTitle = title
              }
            })
            return new OB11GroupTitleEvent(parseInt(msg.peerUid), parseInt(memberUin), title)
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
    const msgElement = msg.elements.find(
      (element) => element.grayTipElement?.subElementType === GrayTipElementSubType.RECALL,
    )
    if (!msgElement) {
      return
    }
    const revokeElement = msgElement.grayTipElement.revokeElement
    if (msg.chatType === ChatType.group) {
      const operator = await ctx.ntGroupApi.getGroupMember(msg.peerUid, revokeElement.operatorUid)
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

  export function friendsV2(friends: FriendV2[]): OB11User[] {
    const data: OB11User[] = []
    for (const friend of friends) {
      const sexValue = sex(friend.baseInfo.sex!)
      data.push({
        ...omit(friend.baseInfo, ['richBuffer']),
        ...friend.coreInfo,
        user_id: parseInt(friend.coreInfo.uin),
        nickname: friend.coreInfo.nick,
        remark: friend.coreInfo.nick,
        sex: sexValue,
        level: 0,
        categroyName: friend.categroyName,
        categoryId: friend.categoryId
      })
    }
    return data
  }

  export function groupMemberRole(role: number): OB11GroupMemberRole | undefined {
    return {
      4: OB11GroupMemberRole.owner,
      3: OB11GroupMemberRole.admin,
      2: OB11GroupMemberRole.member,
    }[role]
  }

  export function sex(sex: Sex): OB11UserSex {
    const sexMap = {
      [Sex.male]: OB11UserSex.male,
      [Sex.female]: OB11UserSex.female,
      [Sex.unknown]: OB11UserSex.unknown,
    }
    return sexMap[sex] || OB11UserSex.unknown
  }

  export function groupMember(group_id: string, member: GroupMember): OB11GroupMember {
    return {
      group_id: parseInt(group_id),
      user_id: parseInt(member.uin),
      nickname: member.nick,
      card: member.cardName,
      sex: sex(member.sex!),
      age: 0,
      area: '',
      level: '0',
      qq_level: (member.qqLevel && calcQQLevel(member.qqLevel)) || 0,
      join_time: 0, // 暂时没法获取
      last_sent_time: 0, // 暂时没法获取
      title_expire_time: 0,
      unfriendly: false,
      card_changeable: true,
      is_robot: member.isRobot,
      shut_up_timestamp: member.shutUpTime,
      role: groupMemberRole(member.role),
      title: member.memberSpecialTitle || '',
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
      member_count: group.memberCount,
      max_member_count: group.maxMember,
    }
  }

  export function groups(groups: Group[]): OB11Group[] {
    return groups.map(group)
  }
}
