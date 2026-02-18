import { Handler } from '../../index'
import { Dict } from 'cosmokit'

interface Payload {
  guild_id: string
  user_id: string
  role_id: string
}

export const setGuildMemberRole: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.guild_id)
  if (!uid) {
    throw new Error('无法获取用户信息')
  }
  if (payload.role_id !== '2' && payload.role_id !== '3') {
    throw new Error('role_id 仅可以为 2 或 3')
  }
  const res = await ctx.ntGroupApi.setMemberRole(payload.guild_id, uid, +payload.role_id)
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
