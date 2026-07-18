import { IncomingMessage, IncomingSegment, IncomingForwardedMessage } from '@/milky/generated/schema'
import { transformFriend, transformGroup, transformGroupMember } from '@/milky/transform/entity'
import { RawMessage, ElementType, AtType, ChatType, Group } from '@/ntqqapi/types'
import { Friend, GroupMember } from '@/ntqqapi/types'
import { Context } from 'cordis'
import { XMLParser } from 'fast-xml-parser'

export async function transformIncomingPrivateMessage(
  ctx: Context,
  friend: Friend,
  message: RawMessage,
): Promise<IncomingMessage> {
  return {
    message_scene: 'friend',
    peer_id: +message.peerUin,
    message_seq: +message.msgSeq,
    sender_id: +message.senderUin,
    time: +message.msgTime,
    segments: await transformIncomingSegments(ctx, message),
    friend: transformFriend(friend),
  }
}

export async function transformIncomingGroupMessage(
  ctx: Context,
  group: Group,
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
  group: Group,
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
              user_id: element.textElement.atUin,
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

      case ElementType.Reply: {
        const { replyMsgSeq, senderUin, replyMsgTime, replyMsgClientSeq } = element.replyElement!
        const peer = {
          chatType: message.chatType,
          peerUid: message.peerUid
        }
        let msg = ctx.store.getMsgBySeq(message.peerUid, replyMsgSeq)
        if (!msg) {
          const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, replyMsgSeq)
          msg = msgList[0]
        }
        if (!msg && peer.chatType !== ChatType.Group) {
          const { msgList } = await ctx.ntMsgApi.getC2CMsgsByTimeAndCount(peer, replyMsgTime + 1, 3, true)
          msg = msgList.find(e => e.clientSeq === replyMsgClientSeq)
        }
        segments.push({
          type: 'reply',
          data: {
            message_seq: replyMsgSeq,
            sender_id: senderUin,
            time: replyMsgTime,
            segments: msg ? await transformIncomingSegments(ctx, msg) : []
          },
        })
        break
      }

      case ElementType.Pic:
        segments.push({
          type: 'image',
          data: {
            resource_id: element.picElement!.fileUuid,
            temp_url: await ctx.ntFileApi.getImageUrl(element.picElement!.originImageUrl, element.picElement!.md5HexStr),
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
            temp_url: await ctx.ntFileApi.getVideoUrl(element.videoElement!.fileUuid, message.chatType === ChatType.Group),
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

      case ElementType.Ark: {
        const { arkElement } = element
        const match = arkElement!.bytesData.match(/"app"\s*:\s*"([^"]*)"/)
        if (match?.[1]) {
          if (match[1] === 'com.tencent.multimsg') {
            const data = JSON.parse(arkElement!.bytesData)
            segments.push({
              type: 'forward',
              data: {
                forward_id: data.meta.detail.resid,
                title: data.meta.detail.source,
                preview: data.meta.detail.news.map((item: { text: string }) => item.text),
                summary: data.meta.detail.summary,
              },
            })
          } else {
            segments.push({
              type: 'light_app',
              data: {
                app_name: match[1],
                json_payload: arkElement!.bytesData,
              },
            })
          }
        }
        break
      }

      case ElementType.Markdown:
        segments.push({
          type: 'markdown',
          data: {
            content: element.markdownElement!.content
          }
        })
        break
    }
  }

  return segments
}

export async function transformIncomingForwardedMessage(ctx: Context, message: RawMessage): Promise<IncomingForwardedMessage> {
  return {
    message_seq: message.msgSeq,
    sender_name: message.sendNickName,
    avatar_url: message.forwardAvatar,
    time: message.msgTime,
    segments: await transformIncomingSegments(ctx, message)
  }
}
