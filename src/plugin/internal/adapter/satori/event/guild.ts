import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import type { NormalizeHost } from '../../../../../universal/types'
import { encodeGroupRequestFlag } from '../utils'

export async function parseGuildAdded(
  bot: NormalizeHost,
  data: NT.GroupAddedEvent
) {
  return bot.event('guild-added', {
    guild: {
      id: data.groupCode.toString()
    }
  })
}

export async function parseGuildUpdated(
  bot: NormalizeHost,
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
  bot: NormalizeHost,
  data: NT.GroupRemovedEvent
) {
  return bot.event('guild-removed', {
    guild: {
      id: data.groupCode.toString()
    }
  })
}

export async function parseGuildRequest(
  bot: NormalizeHost,
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
