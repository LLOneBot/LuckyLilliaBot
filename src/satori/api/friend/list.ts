import { List, Friend } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'

interface Payload {
  next?: string
}

export const getFriendList: Handler<List<Friend>, Payload> = async (ctx) => {
  const friends = await ctx.ntFriendApi.getBuddyList()
  return {
    data: friends.map(e => ({
      user: decodeUser(e.coreInfo),
      nick: e.coreInfo.remark
    }))
  }
}
