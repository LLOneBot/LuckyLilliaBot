import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  user_id: string
}

export const deleteFriend: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(+payload.user_id)
  if (!uid) throw new Error('无法获取用户信息')
  await ctx.ntFriendApi.deleteFriend(uid)
  return {}
}
