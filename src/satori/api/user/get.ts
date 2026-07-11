import { User } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'

interface Payload {
  user_id: string
}

export const getUser: Handler<User, Payload> = async (ctx, payload) => {
  const data = await ctx.ntUserApi.getUserByUin(+payload.user_id)
  return decodeUser(data)
}
