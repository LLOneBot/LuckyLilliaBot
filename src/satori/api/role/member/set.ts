import { Handler } from '../../index'
import { Dict } from 'cosmokit'

interface Payload {
  guild_id: string
  user_id: string
  role_id: string
}

export const setGuildMemberRole: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(+payload.user_id, +payload.guild_id)
  if (!uid) {
    throw new Error('无法获取用户信息')
  }
  const result = await ctx.ntGroupApi.setGroupMemberAdmin(
    +payload.guild_id,
    uid,
    payload.role_id === '2'
  )
  if (result.errorCode !== 0) {
    throw new Error(result.errorMsg)
  }
  return {}
}
