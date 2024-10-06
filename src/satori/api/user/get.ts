import { User } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'

interface Payload {
  user_id: string
}

export const getUser: Handler<User, Payload> = async (ctx, payload) => {
  const uin = payload.user_id
  const uid = await ctx.ntUserApi.getUidByUin(uin)
  if (!uid) throw new Error('无法获取用户信息')
  const data = await ctx.ntUserApi.getUserSimpleInfo(uid)
  const ranges = await ctx.ntUserApi.getRobotUinRange()
  return {
    ...decodeUser(data),
    is_bot: ranges.some(e => uin >= e.minUin && uin <= e.maxUin)
  }
}
