import { GuildMember } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuildMember } from '../../utils'

interface Payload {
  guild_id: string
  user_id: string
}

export const getGuildMember: Handler<GuildMember, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.guild_id)
  if (!uid) throw new Error('无法获取用户信息')
  const info = await ctx.ntGroupApi.getGroupMember(payload.guild_id, uid, true)
  return decodeGuildMember(info)
}
