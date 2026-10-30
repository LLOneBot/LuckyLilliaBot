import { List, Friend } from '@satorijs/protocol'
import { Handler } from '..'
import { decodeUser } from '@/plugin/internal/service/ntqq-universal/utils'

interface Payload {
  next?: string
}

export const getFriendList: Handler<List<Friend>, Payload> = async (ctx) => {
  const result = await ctx.ntFriendApi.getFriends(true)
  return {
    data: result.friends.map(e => ({
      user: decodeUser(e),
      nick: e.remark
    }))
  }
}
