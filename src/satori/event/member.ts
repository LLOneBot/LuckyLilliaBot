import * as NT from '@/ntqqapi/types'
import SatoriAdapter from '../adapter'
import { encodeGroupRequestFlag } from '../utils'

export async function parseGuildMemberAdded(
  bot: SatoriAdapter,
  data: NT.GroupMemberAddedEvent
) {
  return bot.event('guild-member-added', {
    guild: {
      id: data.groupCode.toString()
    },
    user: {
      id: data.memberUin.toString()
    },
    member: {
      user: {
        id: data.memberUin.toString()
      }
    }
  })
}

export async function parseGuildMemberRemoved(
  bot: SatoriAdapter,
  data: NT.GroupMemberRemovedEvent
) {
  return bot.event('guild-member-removed', {
    guild: {
      id: data.groupCode.toString()
    },
    user: {
      id: data.memberUin.toString()
    },
    member: {
      user: {
        id: data.memberUin.toString()
      }
    }
  })
}

export async function parseGuildMemberRequest(
  bot: SatoriAdapter,
  data: NT.GroupJoinRequestEvent | NT.GroupInvitedJoinRequestEvent,
  type: number
) {
  return bot.event('guild-member-request', {
    guild: {
      id: data.groupCode.toString()
    },
    member: {
      user: {
        id: data.initiatorUin.toString()
      }
    },
    user: {
      id: data.initiatorUin.toString()
    },
    message: {
      id: encodeGroupRequestFlag(
        data.groupCode,
        data.notificationSeq,
        type,
        'isDoubt' in data ? data.isDoubt : false
      ),
      content: 'comment' in data ? data.comment : ''
    }
  })
}
