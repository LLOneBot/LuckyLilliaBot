import { User, List } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeUser } from '../../utils'
import { getBuildVersion } from '@/common/utils/misc'

interface Payload {
  next?: string
}

export const getFriendList: Handler<List<User>, Payload> = async (ctx) => {
  if (getBuildVersion() >= 26702) {
    const friends = await ctx.ntFriendApi.getBuddyV2()
    return {
      data: friends.map(e => decodeUser(e.coreInfo))
    }
  } else {
    const friends = await ctx.ntFriendApi.getFriends()
    return {
      data: friends.map(e => decodeUser(e))
    }
  }
}
