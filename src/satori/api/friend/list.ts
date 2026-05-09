import { List, Friend } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'

interface Payload {
  next?: string
}

export const getFriendList: Handler<List<Friend>, Payload> = async (ctx) => {
  const result = await ctx.ntFriendApi.getFriendList(true)
  return {
    data: result.friends.map(e => ({
      user: decodeUser(e),
      nick: e.remark
    }))
  }
}
