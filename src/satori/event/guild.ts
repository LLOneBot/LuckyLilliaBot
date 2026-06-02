import * as NT from '@/ntqqapi/types'
import SatoriAdapter from '../adapter'
import { encodeGroupRequestFlag } from '../utils'

export async function parseGuildAdded(
  bot: SatoriAdapter,
  data: NT.GroupAddedEvent
) {
  return bot.event('guild-added', {
    guild: {
      id: data.groupCode.toString()
    }
  })
}

export async function parseGuildUpdated(
  bot: SatoriAdapter,
  data: NT.GroupNameChangedEvent
) {
  return bot.event('guild-updated', {
    guild: {
      id: data.groupCode.toString(),
      name: data.newGroupName
    }
  })
}

export async function parseGuildRemoved(
  bot: SatoriAdapter,
  data: NT.GroupRemovedEvent
) {
  return bot.event('guild-removed', {
    guild: {
      id: data.groupCode.toString()
    }
  })
}

export async function parseGuildRequest(
  bot: SatoriAdapter,
  data: NT.GroupInvitationEvent
) {
  return bot.event('guild-request', {
    guild: {
      id: data.groupCode.toString()
    },
    message: {
      id: encodeGroupRequestFlag(
        data.groupCode,
        data.invitationSeq,
        NT.GroupNotificationType.Invitation,
        false
      )
    },
    operator: {
      id: data.initiatorUin.toString()
    }
  })
}
