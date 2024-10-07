import { GuildMember } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuildMember } from '../../utils'

interface Payload {
  guild_id: string
  user_id: string
}

export const getGuildMember: Handler<GuildMember, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
  if (!uid) throw new Error('无法获取用户信息')
  const info = await ctx.ntGroupApi.getGroupMember(payload.guild_id, uid)
  if (!info) {
    throw new Error(`群成员${payload.user_id}不存在`)
  }
  return decodeGuildMember(info)
}
