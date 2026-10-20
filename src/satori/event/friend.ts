import * as NT from '@/ntqqapi/types'
import type { NormalizeHost } from '../../universal/types'

export async function parseFriendRequest(
  bot: NormalizeHost,
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
