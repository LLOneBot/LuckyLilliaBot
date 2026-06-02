import * as NT from '@/ntqqapi/types'
import SatoriAdapter from '../adapter'

export async function parseFriendRequest(
  bot: SatoriAdapter,
  data: NT.FriendRequestEvent
) {
  return bot.event('friend-request', {
    user: {
      id: data.initiatorUin.toString()
    },
    message: {
      id: data.initiatorUid,
      content: data.comment
    }
  })
}
