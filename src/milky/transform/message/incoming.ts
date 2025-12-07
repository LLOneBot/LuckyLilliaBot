import { IncomingMessage, IncomingSegment, IncomingForwardedMessage } from '@saltify/milky-types'
import { transformFriend, transformGroup, transformGroupMember } from '@/milky/transform/entity'
import { RawMessage, ElementType, AtType, GroupAllInfo, Peer } from '@/ntqqapi/types'
import { SimpleInfo, CategoryFriend, GroupMember } from '@/ntqqapi/types'
import { Context } from 'cordis'

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
          },
        })
        break

      case ElementType.Reply:
        segments.push({
          type: 'reply',
          data: {
            message_seq: +element.replyElement!.replayMsgSeq,
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
            summary: element.picElement!.summary,
            sub_type: element.picElement!.picSubType === 1 ? 'sticker' : 'normal',
          },
        })
        break

      case ElementType.Ptt:
        segments.push({
          type: 'record',
          data: {
            resource_id: element.pttElement!.fileUuid,
            temp_url: '', // TODO: 获取直链，群聊的还没写好
            duration: element.pttElement!.duration,
          },
        })
        break

      case ElementType.Video:
        segments.push({
          type: 'video',
          data: {
            resource_id: element.videoElement!.fileUuid,
            temp_url: element.videoElement!.filePath,
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

      case ElementType.MultiForward:
        segments.push({
          type: 'forward',
          data: {
            forward_id: `${message.chatType}|${message.peerUid}|${message.msgId}`,
          },
        })
        break

      case ElementType.MarketFace:
        segments.push({
          type: 'market_face',
          data: {
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

export async function transformIncomingForwardedMessage(ctx: Context, message: RawMessage, rootMsgId: string, peer: Peer): Promise<IncomingForwardedMessage> {
  const segments = await transformIncomingSegments(ctx, message)
  for (const item of segments) {
    if (item.type === 'forward') {
      const [, , msgId] = item.data.forward_id.split('|')
      ctx.store.addMultiMsgInfo(rootMsgId, msgId, peer)
    }
  }
  return {
    sender_name: message.sendNickName,
    avatar_url: `https://thirdqq.qlogo.cn/g?b=qq&nk=${message.senderUin}&s=640`,
    time: +message.msgTime,
    segments
  }
}
