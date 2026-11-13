import h from '@satorijs/element'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import faceConfig from '@/plugin/internal/protocol/nt-protocol/ntqqapi/helper/face_config.json'
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
      const { atUin, atType, content } = v.textElement
      if (atType === NT.AtType.All) {
        buffer.push(h.at(undefined, { type: 'all' }))
      } else if (atType === NT.AtType.One) {
        buffer.push(h.at(atUin.toString(), { name: content.replace('@', '') }))
      }
    } else if (v.textElement && v.textElement.content) {
      buffer.push(h.text(v.textElement.content))
    } else if (v.replyElement && !quoted) {
      const peer = {
        chatType: data.chatType,
        peerUid: data.peerUid,
        guildId: ''
      }
      try {
        const { replyMsgSeq, replyMsgTime, replyMsgClientSeq } = v.replyElement
        let replyMsg = ctx.store.getMsgBySeq(peer.peerUid, replyMsgSeq)
        if (!replyMsg) {
          const { msgList } = await ctx.ntMsgApi.getSingleMsg(peer, replyMsgSeq)
          replyMsg = msgList[0]
        }
        if (!replyMsg && peer.chatType !== NT.ChatType.Group) {
          const { msgList } = await ctx.ntMsgApi.getC2CMsgsByTimeAndCount(peer, replyMsgTime + 1, 3, true)
          replyMsg = msgList.find(e => e.clientSeq === replyMsgClientSeq)
        }
        if (!replyMsg) {
          ctx.logger.warn('引用消息获取失败', v.replyElement)
          continue
        }
        const elements = await decodeElement(ctx, replyMsg, true)
        buffer.push(h('quote', {
          id: encodeMessageId(
            peer.chatType,
            peer.peerUid,
            replyMsg.msgSeq
          )
        }, elements))
      } catch (e) {
        ctx.logger.error('获取不到引用的消息', e, v.replyElement, (e as Error).stack)
      }
    } else if (v.picElement) {
      const src = await ctx.ntFileApi.getImageUrl(v.picElement.originImageUrl, v.picElement.md5HexStr, {
        fileUuid: v.picElement.fileUuid,
        isGroup: data.chatType === NT.ChatType.Group,
        peerUid: data.peerUid,
      })
      buffer.push(h.img(src, {
        width: v.picElement.picWidth,
        height: v.picElement.picHeight,
        subType: v.picElement.picSubType
      }))
    } else if (v.pttElement) {
      const src = await ctx.ntFileApi.getPttUrl(v.pttElement.fileUuid, data.chatType === NT.ChatType.Group)
      buffer.push(h.audio(src, { duration: v.pttElement.duration }))
    } else if (v.videoElement) {
      const src = await ctx.ntFileApi.getVideoUrl(v.videoElement.fileUuid, data.chatType === NT.ChatType.Group)
      buffer.push(h.video(src))
    } else if (v.marketFaceElement) {
      const { emojiId, imageWidth, imageHeight } = v.marketFaceElement
      const dir = emojiId.substring(0, 2)
      const src = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw${imageWidth}.gif`
      buffer.push(h('ntqq:market-face', {
        emojiPackageId: v.marketFaceElement.emojiPackageId,
        emojiId,
        key: v.marketFaceElement.key,
        summary: v.marketFaceElement.faceName
      }, [h.image(src, { width: imageWidth, height: imageHeight })]))
    } else if (v.faceElement) {
      const { faceIndex, faceType } = v.faceElement
      const name = faceName(faceIndex, v.faceElement.faceText)
      buffer.push(h('face', {
        id: String(faceIndex),
        type: String(faceType),
        ...(name ? { name } : {}),
      }))
    } else if (v.arkElement) {
      const prompt = arkPrompt(v.arkElement.bytesData)
      buffer.push(h('ntqq:ark', {
        data: v.arkElement.bytesData
      }, prompt ? [h.text(prompt)] : []))
    } else if (v.markdownElement?.content) {
      // From an official bot; an account cannot send it
      buffer.push(h('markdown', {}, v.markdownElement.content))
    } else if (v.inlineKeyboardElement?.rows) {
      for (const row of v.inlineKeyboardElement.rows) {
        buffer.push(h('button-group', {}, (row.buttons ?? []).map(decodeKeyboardButton)))
      }
    }
  }
  return buffer
}

/** `呲牙` for face 13: what the fallback of a face shows where faces cannot be sent. */
function faceName(id: number, text?: string): string {
  const known = faceConfig.sysface.find(face => face.QSid === String(id))?.QDes
  return (known || text || '').replace(/^\//, '').replace(/^\[(.*)\]$/, '$1')
}

/** The line a card shows in the chat list, e.g. `[分享]标题`: the card's text for whoever reads it as text. */
function arkPrompt(data: string): string {
  try {
    const prompt = JSON.parse(data)?.prompt
    return typeof prompt === 'string' ? prompt : ''
  } catch {
    return ''
  }
}

// NT kinds: 0 jumps, 1 calls back, 2 puts the command in the input box (sending it right away with `enter`)
function decodeKeyboardButton(button: NT.InlineKeyboardElementRowButton): h {
  const label = button.label || button.data
  if (button.type === 0) return h('button', { type: 'link', href: button.data }, label)
  if (button.type === 1) return h('button', { type: 'action', id: button.id, data: button.data }, label)
  return h('button', { type: 'input', text: button.data }, label)
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
        [NT.GroupMemberRole.NotApplicable]: 'member'
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
