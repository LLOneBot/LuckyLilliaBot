import { IncomingMessage, IncomingSegment, IncomingForwardedMessage } from '@saltify/milky-types'
import { transformFriend, transformGroup, transformGroupMember } from '@/milky/transform/entity'
import { RawMessage, ElementType, AtType, GroupAllInfo } from '@/ntqqapi/types'
import { SimpleInfo, CategoryFriend, GroupMember } from '@/ntqqapi/types'
import { Context } from 'cordis'
import { InferProtoModel } from '@saltify/typeproto'
import { Media, Msg } from '@/ntqqapi/proto'
import { inflateSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'

export async function transformIncomingPrivateMessage(
  ctx: Context,
  friend: SimpleInfo,
  category: CategoryFriend,
  message: RawMessage,
): Promise<IncomingMessage> {
  return {
    message_scene: 'friend',
    peer_id: +message.peerUin,
    message_seq: +message.msgSeq,
    sender_id: +message.senderUin,
    time: +message.msgTime,
    segments: await transformIncomingSegments(ctx, message),
    friend: transformFriend(friend, category),
  }
}

export async function transformIncomingGroupMessage(
  ctx: Context,
  group: GroupAllInfo,
  member: GroupMember,
  message: RawMessage,
): Promise<IncomingMessage> {
  return {
    message_scene: 'group',
    peer_id: +message.peerUin,
    message_seq: +message.msgSeq,
    sender_id: +message.senderUin,
    time: +message.msgTime,
    segments: await transformIncomingSegments(ctx, message),
    group: transformGroup(group),
    group_member: transformGroupMember(member, +group.groupCode),
  }
}

export async function transformIncomingTempMessage(
  ctx: Context,
  group: GroupAllInfo,
  message: RawMessage,
): Promise<IncomingMessage> {
  return {
    message_scene: 'temp',
    peer_id: +message.peerUin,
    message_seq: +message.msgSeq,
    sender_id: +message.senderUin,
    time: +message.msgTime,
    segments: await transformIncomingSegments(ctx, message),
    group: transformGroup(group),
  }
}

export async function transformIncomingSegments(ctx: Context, message: RawMessage): Promise<IncomingSegment[]> {
  const segments: IncomingSegment[] = []

  for (const element of message.elements) {
    switch (element.elementType) {
      case ElementType.Text:
        if (element.textElement?.atType === AtType.All) {
          segments.push({
            type: 'mention_all',
            data: {},
          })
        } else if (element.textElement?.atType === AtType.One) {
          segments.push({
            type: 'mention',
            data: {
              user_id: +element.textElement.atUid,
              name: element.textElement.content.slice(1)
            },
          })
        } else if (element.textElement?.content) {
          segments.push({
            type: 'text',
            data: {
              text: element.textElement.content,
            },
          })
        }
        break

      case ElementType.Face:
        segments.push({
          type: 'face',
          data: {
            face_id: element.faceElement!.faceIndex.toString(),
            is_large: element.faceElement!.faceType === 3
          },
        })
        break

      case ElementType.Reply:
        segments.push({
          type: 'reply',
          data: {
            message_seq: +element.replyElement!.replayMsgSeq,
            sender_id: +element.replyElement!.senderUid,
            time: +element.replyElement!.replyMsgTime,
            segments: await transformIncomingSegments(ctx, message.records[0])
          },
        })
        break

      case ElementType.Pic:
        segments.push({
          type: 'image',
          data: {
            resource_id: element.picElement!.fileUuid,
            temp_url: await ctx.ntFileApi.getImageUrl(element.picElement!),
            width: element.picElement!.picWidth,
            height: element.picElement!.picHeight,
            summary: element.picElement!.summary || '[图片]',
            sub_type: element.picElement!.picSubType === 1 ? 'sticker' : 'normal',
          },
        })
        break

      case ElementType.Ptt:
        segments.push({
          type: 'record',
          data: {
            resource_id: element.pttElement!.fileUuid,
            temp_url: await ctx.ntFileApi.getPttUrl(element.pttElement!.fileUuid, message.chatType === 2),
            duration: element.pttElement!.duration,
          },
        })
        break

      case ElementType.Video:
        segments.push({
          type: 'video',
          data: {
            resource_id: element.videoElement!.fileUuid,
            temp_url: await ctx.ntFileApi.getVideoUrl({
              chatType: message.chatType,
              peerUid: message.peerUid,
              guildId: message.guildId
            }, message.msgId, element.elementId),
            width: element.videoElement!.thumbWidth,
            height: element.videoElement!.thumbHeight,
            duration: element.videoElement!.fileTime,
          },
        })
        break

      case ElementType.File:
        segments.push({
          type: 'file',
          data: {
            file_id: element.fileElement!.fileUuid,
            file_name: element.fileElement!.fileName,
            file_size: +element.fileElement!.fileSize,
          },
        })
        break

      case ElementType.MultiForward: {
        const parser = new XMLParser()
        const content = parser.parse(element.multiForwardMsgElement!.xmlContent)
        segments.push({
          type: 'forward',
          data: {
            forward_id: element.multiForwardMsgElement!.resId,
            title: content.msg.item.title[0],
            preview: content.msg.item.title.slice(1),
            summary: content.msg.item.summary,
          },
        })
        break
      }

      case ElementType.MarketFace:
        segments.push({
          type: 'market_face',
          data: {
            emoji_package_id: element.marketFaceElement!.emojiPackageId,
            emoji_id: element.marketFaceElement!.emojiId,
            key: element.marketFaceElement!.key,
            summary: element.marketFaceElement!.faceName,
            url: `https://gxh.vip.qq.com/club/item/parcel/item/${element.marketFaceElement!.emojiId.substring(0, 2)}/${element.marketFaceElement!.emojiId}/raw300.gif`,
          },
        })
        break

      case ElementType.Ark:
        segments.push({
          type: 'light_app',
          data: {
            app_name: JSON.parse(element.arkElement!.bytesData).app,
            json_payload: element.arkElement!.bytesData,
          },
        })
        break
    }
  }

  return segments
}

export async function transformIncomingForwardedMessage(ctx: Context, message: InferProtoModel<typeof Msg.Message>): Promise<IncomingForwardedMessage> {
  const { body, contentHead, routingHead } = message
  const transformSegments = async (elems: InferProtoModel<typeof Msg.Elem>[]) => {
    const segments: IncomingSegment[] = []
    for (const elem of elems) {
      if (elem.text) {
        segments.push({
          type: 'text',
          data: {
            text: elem.text.str
          }
        })
      } else if (elem.commonElem) {
        const { businessType, serviceType } = elem.commonElem
        if (serviceType === 33) {
          const { faceId } = Msg.QSmallFaceExtra.decode(elem.commonElem.pbElem)
          segments.push({
            type: 'face',
            data: {
              face_id: faceId.toString(),
              is_large: false
            }
          })
        } else if (serviceType === 48 && (businessType === 10 || businessType === 20)) {
          const { extBizInfo, msgInfoBody } = Media.MsgInfo.decode(elem.commonElem.pbElem)
          const { index, pic } = msgInfoBody[0]
          const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey()
          const rkey = businessType === 10 ? rkeyData.private_rkey : rkeyData.group_rkey
          const url = `https://${pic!.domain}${pic!.urlPath}&spec=0${rkey}`
          segments.push({
            type: 'image',
            data: {
              resource_id: index.fileUuid,
              temp_url: url,
              width: index.info.width,
              height: index.info.height,
              summary: extBizInfo.pic.summary || '[图片]',
              sub_type: extBizInfo.pic.bizType === 0 ? 'normal' : 'sticker'
            }
          })
        } else if (serviceType === 48 && (businessType === 11 || businessType === 21)) {
          const { msgInfoBody } = Media.MsgInfo.decode(elem.commonElem.pbElem)
          const { index } = msgInfoBody[0]
          const url = await ctx.ntFileApi.getVideoUrlByPacket(index.fileUuid, businessType === 21)
          segments.push({
            type: 'video',
            data: {
              resource_id: index.fileUuid,
              temp_url: url,
              width: index.info.width,
              height: index.info.height,
              duration: index.info.time
            }
          })
        }
      } else if (elem.srcMsg) {
        const elems = elem.srcMsg.elems.map(e => Msg.Elem.decode(e))
        const { contentHead, routingHead } = Msg.Message.decode(elem.srcMsg.srcMsg!)
        segments.push({
          type: 'reply',
          data: {
            message_seq: elem.srcMsg.origSeqs[0],
            sender_id: elem.srcMsg.senderUin,
            sender_name: contentHead.msgType === 82 ? routingHead.group.groupCard : routingHead.c2c.friendName,
            time: elem.srcMsg.time,
            segments: await transformSegments(elems)
          }
        })
      } else if (elem.richMsg && elem.richMsg.serviceId === 35) {
        const xml = inflateSync(elem.richMsg.template.subarray(1)).toString()
        const resId = xml.match(/m_resid="([^"]+)"/)?.[1]
        if (resId) {
          const parser = new XMLParser()
          const content = parser.parse(xml)
          segments.push({
            type: 'forward',
            data: {
              forward_id: resId,
              title: content.msg.item.title[0],
              preview: content.msg.item.title.slice(1),
              summary: content.msg.item.summary
            }
          })
        }
      }
    }
    return segments
  }
  return {
    message_seq: contentHead.msgSeq,
    sender_name: contentHead.msgType === 82 ? routingHead.group.groupCard : routingHead.c2c.friendName,
    avatar_url: contentHead.forward!.avatar,
    time: contentHead.msgTime,
    segments: await transformSegments(body.richText.elems)
  }
}
