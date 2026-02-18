import h from '@satorijs/element'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { Context } from 'cordis'
import { ObjectToSnake } from 'ts-case-convert'
import { pathToFileURL } from 'node:url'

interface User {
  uin: string
  nick: string
  remark?: string
}

export function decodeUser(user: User): ObjectToSnake<Universal.User> {
  return {
    id: user.uin,
    name: user.nick,
    nick: user.remark || user.nick,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${user.uin}&spec=640`,
    is_bot: false
  }
}

function decodeGuildChannelId(data: NT.RawMessage) {
  if (data.chatType === NT.ChatType.Group) {
    return [data.peerUin, data.peerUin]
  } else {
    return [undefined, 'private:' + data.peerUin]
  }
}

function decodeMessageUser(data: NT.RawMessage) {
  return {
    id: data.senderUin,
    name: data.sendNickName,
    nick: data.sendRemarkName || data.sendNickName,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.senderUin}&spec=640`
  }
}

async function decodeElement(ctx: Context, data: NT.RawMessage, quoted = false) {
  const buffer: h[] = []
  for (const v of data.elements) {
    if (v.textElement && v.textElement.atType !== NT.AtType.Unknown) {
      // at
      const { atNtUid, atUid, atType, content } = v.textElement
      if (atType === NT.AtType.All) {
        buffer.push(h.at(undefined, { type: 'all' }))
      } else if (atType === NT.AtType.One) {
        let id: string
        if (atUid && atUid !== '0') {
          id = atUid
        } else {
          id = await ctx.ntUserApi.getUinByUid(atNtUid)
        }
        buffer.push(h.at(id, { name: content.replace('@', '') }))
      }
    } else if (v.textElement && v.textElement.content) {
      // text
      buffer.push(h.text(v.textElement.content))
    } else if (v.replyElement && !quoted) {
      // quote
      if (data.multiTransInfo) {
        continue
      }
      const peer = {
        chatType: data.chatType,
        peerUid: data.peerUid,
        guildId: ''
      }
      try {
        const { replayMsgSeq, replyMsgTime, sourceMsgIdInRecords, senderUidStr } = v.replyElement
        const record = data.records.find(msgRecord => msgRecord.msgId === sourceMsgIdInRecords)
        const { msgList } = await ctx.ntMsgApi.queryMsgsWithFilterExBySeq(peer, replayMsgSeq, replyMsgTime, [senderUidStr])
        let replyMsg: NT.RawMessage | undefined
        if (record && record.msgRandom !== '0') {
          replyMsg = msgList.find(msg => msg.msgRandom === record.msgRandom)
        } else {
          replyMsg = msgList[0]
        }
        if (!replyMsg) {
          ctx.logger.warn('引用消息获取失败', v.replyElement, record)
          continue
        }
        const elements = await decodeElement(ctx, replyMsg, true)
        buffer.push(h('quote', { id: replyMsg.msgId }, elements))
      } catch (e) {
        ctx.logger.error('获取不到引用的消息', e, v.replyElement, (e as Error).stack)
      }
    } else if (v.picElement) {
      // img
      const src = await ctx.ntFileApi.getImageUrl(v.picElement)
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
      const src = (await ctx.ntFileApi.getVideoUrl({
        chatType: data.chatType,
        peerUid: data.peerUid,
        guildId: ''
      }, data.msgId, v.elementId)) || pathToFileURL(v.videoElement.filePath).href
      buffer.push(h.video(src))
    } else if (v.marketFaceElement) {
      // llonebot:market-face
      const { emojiId, supportSize } = v.marketFaceElement
      const { width = 300, height = 300 } = supportSize?.[0] ?? {}
      const dir = emojiId.substring(0, 2)
      const src = `https://gxh.vip.qq.com/club/item/parcel/item/${dir}/${emojiId}/raw${width}.gif`
      buffer.push(h('llonebot:market-face', {
        emojiPackageId: v.marketFaceElement.emojiPackageId,
        emojiId,
        key: v.marketFaceElement.key,
        summary: v.marketFaceElement.faceName
      }, [h.image(src, { width, height })]))
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
  if (!data.senderUin || data.senderUin === '0') return //跳过空消息

  const [guildId, channelId] = decodeGuildChannelId(data)
  const elements = await decodeElement(ctx, data)

  if (elements.length === 0) return

  message.id = data.msgId
  message.content = elements.join('')
  message.channel = {
    id: channelId!,
    name: data.peerName,
    type: guildId ? Universal.Channel.Type.TEXT : Universal.Channel.Type.DIRECT
  }
  message.user = decodeMessageUser(data)
  message.created_at = +data.msgTime * 1000
  if (!message.user.name) {
    const info = (await ctx.ntUserApi.getUserSimpleInfo(data.senderUid)).coreInfo
    message.user.name = info.nick
    message.user.nick = info.remark || info.nick
    if (message.channel.type === Universal.Channel.Type.DIRECT) {
      message.channel.name = info.nick
    }
  }
  if (guildId) {
    message.guild = {
      id: guildId,
      name: data.peerName,
      avatar: `https://p.qlogo.cn/gh/${guildId}/${guildId}/640`
    }
    message.member = {
      user: message.user,
      nick: data.sendMemberName || message.user.name
    }
  }

  return message
}

export function decodeGuildMember(data: NT.GroupMember): ObjectToSnake<Universal.GuildMember> {
  return {
    user: {
      ...decodeUser(data),
      is_bot: data.isRobot
    },
    nick: data.cardName || data.nick,
    avatar: `http://q.qlogo.cn/headimg_dl?dst_uin=${data.uin}&spec=640`,
    joined_at: data.joinTime * 1000
  }
}

export function decodeGuild(data: Record<'groupCode' | 'groupName', string>): ObjectToSnake<Universal.Guild> {
  return {
    id: data.groupCode,
    name: data.groupName,
    avatar: `https://p.qlogo.cn/gh/${data.groupCode}/${data.groupCode}/640`
  }
}

export async function getPeer(ctx: Context, channelId: string): Promise<NT.Peer> {
  if (channelId.startsWith('private:')) {
    const uin = channelId.replace('private:', '')
    const uid = await ctx.ntUserApi.getUidByUin(uin)
    if (!uid) throw new Error('无法获取用户信息')
    const isBuddy = await ctx.ntFriendApi.isBuddy(uid)
    if (!isBuddy) {
      const res = await ctx.ntMsgApi.getTempChatInfo(NT.ChatType.TempC2CFromGroup, uid)
      if (res.tmpChatInfo.groupCode) {
        return {
          chatType: NT.ChatType.TempC2CFromGroup,
          peerUid: uid,
          guildId: ''
        }
      }
    }
    return {
      chatType: NT.ChatType.C2C,
      peerUid: uid,
      guildId: ''
    }
  } else {
    return {
      chatType: NT.ChatType.Group,
      peerUid: channelId,
      guildId: ''
    }
  }
}
