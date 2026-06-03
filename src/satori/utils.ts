import h from '@satorijs/element'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { Context } from 'cordis'
import { ObjectToSnake } from 'ts-case-convert'

interface User {
  uin: number | string
  nick: string
  remark?: string
}

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

export function decodeUser(user: User): ObjectToSnake<Universal.User> {
  return {
    id: user.uin.toString(),
    name: user.nick,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
    is_bot: robotUinRanges.some(e => +user.uin >= +e.minUin && +user.uin <= +e.maxUin)
  }
}

export function decodeGuildChannelId(data: {
  chatType: NT.ChatType,
  peerUid: string,
  peerUin: number
}): [string | undefined, string] {
  if (data.chatType === NT.ChatType.Group) {
    return [data.peerUid, data.peerUid]
  } else {
    return [undefined, 'private:' + data.peerUin]
  }
}

async function decodeElement(ctx: Context, data: NT.RawMessage, quoted = false) {
  const buffer: h[] = []
  for (const v of data.elements) {
    if (v.textElement && v.textElement.atType !== NT.AtType.Unknown) {
      // at
      const { atUin, atType, content } = v.textElement
      if (atType === NT.AtType.All) {
        buffer.push(h.at(undefined, { type: 'all' }))
      } else if (atType === NT.AtType.One) {
        buffer.push(h.at(atUin.toString(), { name: content.replace('@', '') }))
      }
    } else if (v.textElement && v.textElement.content) {
      // text
      buffer.push(h.text(v.textElement.content))
    } else if (v.replyElement && !quoted) {
      // quote
      const peer = {
        chatType: data.chatType,
        peerUid: data.peerUid,
        guildId: ''
      }
      try {
        const { replyMsgSeq } = v.replyElement
        let replyMsg = ctx.store.getMsgBySeq(peer.peerUid, replyMsgSeq)
        if (!replyMsg) {
          const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, replyMsgSeq)
          replyMsg = msgList[0]
        }
        if (!replyMsg) {
          ctx.logger.warn('引用消息获取失败', v.replyElement)
          continue
        }
        const elements = await decodeElement(ctx, replyMsg, true)
        buffer.push(h('quote', { id: encodeMessageId(
          peer.chatType,
          peer.peerUid,
          replyMsg.msgSeq
        ) }, elements))
      } catch (e) {
        ctx.logger.error('获取不到引用的消息', e, v.replyElement, (e as Error).stack)
      }
    } else if (v.picElement) {
      // img
      const src = await ctx.ntFileApi.getImageUrl(v.picElement.originImageUrl, v.picElement.md5HexStr)
      buffer.push(h.img(src, {
        width: v.picElement.picWidth,
        height: v.picElement.picHeight,
        subType: v.picElement.picSubType
      }))
    } else if (v.pttElement) {
      // audio
      const src = await ctx.ntFileApi.getPttUrl(v.pttElement.fileUuid, data.chatType === NT.ChatType.Group)
      buffer.push(h.audio(src, { duration: v.pttElement.duration }))
    } else if (v.videoElement) {
      // video
      const src = await ctx.ntFileApi.getVideoUrl(v.videoElement.fileUuid, data.chatType === NT.ChatType.Group)
      buffer.push(h.video(src))
    } else if (v.marketFaceElement) {
      // llonebot:market-face
      const { emojiId, imageWidth, imageHeight } = v.marketFaceElement
      const dir = emojiId.substring(0, 2)
      const src = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw${imageWidth}.gif`
      buffer.push(h('llonebot:market-face', {
        emojiPackageId: v.marketFaceElement.emojiPackageId,
        emojiId,
        key: v.marketFaceElement.key,
        summary: v.marketFaceElement.faceName
      }, [h.image(src, { width: imageWidth, height: imageHeight })]))
    } else if (v.faceElement) {
      // face
      const { faceIndex, faceType } = v.faceElement
      buffer.push(h('face', {
        id: String(faceIndex),
        type: String(faceType),
        platform: 'llonebot'
      }))
    } else if (v.arkElement) {
      // llonebot:ark
      buffer.push(h('llonebot:ark', {
        data: v.arkElement.bytesData
      }))
    }
  }
  return buffer
}

export async function decodeMessage(
  ctx: Context,
  data: NT.RawMessage,
  message: ObjectToSnake<Universal.Message> = {}
) {
  const [guildId, channelId] = decodeGuildChannelId(data)
  const elements = await decodeElement(ctx, data)

  if (elements.length === 0) return

  message.id = encodeMessageId(data.chatType, data.peerUid, data.msgSeq)
  message.content = elements.join('')
  message.channel = {
    id: channelId!,
    name: data.peerName,
    type: guildId ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT
  }
  message.user = {
    id: data.senderUin.toString(),
    name: data.sendNickName,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.senderUin}&spec=640`,
    is_bot: robotUinRanges.some(e => data.senderUin >= e.minUin && data.senderUin <= e.maxUin)
  }
  message.created_at = +data.msgTime * 1000
  if (!message.user.name) {
    const u = await ctx.ntUserApi.getUserByUid(data.senderUid)
    message.user.name = u.nick
  }
  if (!message.channel.name && message.channel.type === Universal.Channel.Type.DIRECT) {
    const u = await ctx.ntUserApi.getUserByUid(data.peerUid)
    message.channel.name = u.nick
  }
  if (guildId) {
    message.guild = {
      id: guildId,
      name: data.peerName,
      avatar: `https://p.qlogo.cn/gh/${guildId}/${guildId}/640`
    }
    message.member = {
      user: message.user,
      nick: data.sendMemberName
    }
  }

  return message
}

export function decodeGuildMember(data: NT.GroupMember): ObjectToSnake<Universal.GuildMember> {
  return {
    user: decodeUser(data),
    nick: data.cardName || data.nick,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.uin}&spec=640`,
    joined_at: data.joinedAt * 1000,
    roles: [{
      id: data.role.toString(),
      name: {
        [NT.GroupMemberRole.Owner]: 'owner',
        [NT.GroupMemberRole.Admin]: 'admin',
        [NT.GroupMemberRole.Normal]: 'member',
      }[data.role]
    }]
  }
}

export function decodeGuild(
  data: { groupCode: string | number, groupName: string }
): ObjectToSnake<Universal.Guild> {
  return {
    id: data.groupCode.toString(),
    name: data.groupName,
    avatar: `https://p.qlogo.cn/gh/${data.groupCode}/${data.groupCode}/640`
  }
}

export async function getPeer(ctx: Context, channelId: string): Promise<NT.Peer> {
  if (channelId.startsWith('private:')) {
    const uin = channelId.replace('private:', '')
    const uid = await ctx.ntUserApi.getUidByUin(+uin)
    if (!uid) throw new Error('无法获取用户信息')
    const isBuddy = await ctx.ntFriendApi.isFriend(uid)
    if (!isBuddy) {
      return {
        chatType: NT.ChatType.TempC2CFromGroup,
        peerUid: uid
      }
    }
    return {
      chatType: NT.ChatType.C2C,
      peerUid: uid
    }
  } else {
    return {
      chatType: NT.ChatType.Group,
      peerUid: channelId
    }
  }
}

export function encodeMessageId(chatType: NT.ChatType, peerUid: string, msgSeq: number) {
  return `${chatType}|${peerUid}|${msgSeq}`
}

export function decodeMessageId(messageId: string) {
  const [chatType, peerUid, msgSeq] = messageId.split('|')
  return {
    chatType: +chatType as NT.ChatType,
    peerUid,
    msgSeq: +msgSeq
  }
}

export function encodeGroupRequestFlag(groupCode: number, seq: number, type: number, doubt: boolean) {
  return `${groupCode}|${seq}|${type}|${doubt ? 1 : 0}`
}

export function decodeGroupRequestFlag(flag: string) {
  const flagitem = flag.split('|')
  const groupCode = +flagitem[0]
  const seq = +flagitem[1]
  const type = +flagitem[2]
  const doubt = flagitem[3] === '1'
  return {
    groupCode,
    seq,
    type,
    doubt
  }
}
