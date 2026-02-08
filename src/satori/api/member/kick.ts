import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  guild_id: string
  user_id: string
  permanent?: boolean
}

export const kickGuildMember: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.guild_id)
  if (!uid) throw new Error('无法获取用户信息')
  const res = await ctx.ntGroupApi.kickMember(payload.guild_id, [uid], Boolean(payload.permanent))
  if (res.errCode !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
