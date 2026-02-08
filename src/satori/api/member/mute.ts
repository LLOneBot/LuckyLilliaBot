import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  guild_id: string
  user_id: string
  duration: number //毫秒
}

export const muteGuildMember: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(payload.user_id, payload.guild_id)
  if (!uid) throw new Error('无法获取用户信息')
  const res = await ctx.ntGroupApi.banMember(payload.guild_id, [
    { uid, timeStamp: payload.duration / 1000 }
  ])
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
