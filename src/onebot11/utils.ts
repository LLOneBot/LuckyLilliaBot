import { ChatType, Peer } from '@/ntqqapi/types'
import { Context } from 'cordis'
import { OB11MessageData, OB11MessageDataType, OB11MessageMixType } from './types'
import { decodeCQCode } from './cqcode'

export interface CreatePeerPayload {
  group_id?: string | number
  user_id?: string | number
}

export enum CreatePeerMode {
  Normal = 0,
  Private = 1,
  Group = 2
}

export async function createPeer(ctx: Context, payload: CreatePeerPayload, mode = CreatePeerMode.Normal): Promise<Peer> {
  if ((mode === CreatePeerMode.Group || mode === CreatePeerMode.Normal) && payload.group_id) {
    return {
      chatType: ChatType.Group,
      peerUid: payload.group_id.toString(),
      guildId: ''
    }
  }
  if ((mode === CreatePeerMode.Private || mode === CreatePeerMode.Normal) && payload.user_id) {
    const uid = await ctx.ntUserApi.getUidByUin(+payload.user_id, payload.group_id ? +payload.group_id : undefined)
    if (!uid) throw new Error('无法获取用户信息')
    const isBuddy = await ctx.ntFriendApi.isFriend(uid)
    if (!isBuddy) {
      return {
        chatType: ChatType.TempC2CFromGroup,
        peerUid: uid,
        guildId: ''
      }
    }
    return {
      chatType: ChatType.C2C,
      peerUid: uid,
      guildId: ''
    }
  }
  throw new Error('请指定 group_id 或 user_id')
}

export function message2List(message: OB11MessageMixType, autoEscape = false) {
  if (typeof message === 'string') {
    if (autoEscape === true) {
      return [
        {
          type: OB11MessageDataType.Text,
          data: {
            text: message,
          },
        },
      ] as OB11MessageData[]
    } else {
      return decodeCQCode(message)
    }
  } else if (!Array.isArray(message)) {
    return [message]
  }
  return message
}

export function encodeGroupRequestFlag(groupCode: number, seq: bigint, type: number, doubt: boolean) {
  return `${groupCode}|${seq}|${type}|${doubt ? 1 : 0}`
}

export function decodeGroupRequestFlag(flag: string) {
  const flagitem = flag.split('|')
  const groupCode = +flagitem[0]
  const seq = BigInt(flagitem[1])
  const type = +flagitem[2]
  const doubt = flagitem[3] === '1'
  return {
    groupCode,
    seq,
    type,
    doubt
  }
}
