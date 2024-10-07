import SatoriAdapter from '../adapter'
import { FriendRequest } from '@/ntqqapi/types'
import { decodeUser } from '../utils'

export async function parseFriendRequest(bot: SatoriAdapter, input: FriendRequest) {
  const flag = input.friendUid + '|' + input.reqTime
  const user = await bot.ctx.ntUserApi.getUserSimpleInfo(input.friendUid)

  return bot.event('friend-request', {
    user: decodeUser(user),
    message: {
      id: flag,
      content: input.extWords
    }
  })
}
