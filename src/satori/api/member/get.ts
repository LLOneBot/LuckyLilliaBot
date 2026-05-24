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
  const member = await ctx.ntGroupApi.getGroupMemberByUid(+payload.guild_id, uid, true)
  if (!member) throw new Error('群组成员未找到')
  return decodeGuildMember(member)
}
