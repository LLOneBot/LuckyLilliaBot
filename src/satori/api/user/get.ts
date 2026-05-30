import { User } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'

interface Payload {
  user_id: string
}

export const getUser: Handler<User, Payload> = async (ctx, payload) => {
  const uid = await ctx.ntUserApi.getUidByUin(+payload.user_id)
  if (!uid) throw new Error('无法获取用户信息')
  // ntUserApi.getUserSimpleInfo 是 wrapper 模式遗留方法，直连模式没实现。
  // getUserByUid 直接走 trpc.qq_new_tech.user.UserService.FetchUserInfoByUid，
  // 返回 NT.User 形状（包含 uin / nick / 个性签名等），decodeUser 接受这个 shape。
  const data = await ctx.ntUserApi.getUserByUid(uid)
  return decodeUser(data)
}
