import SatoriAdapter from '../adapter'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { encodeMessageId } from '../utils'

function buildReactionPayload(data: NT.GroupMessageReactionEvent) {
  return {
    message: {
      id: encodeMessageId(
        NT.ChatType.Group,
        data.groupCode.toString(),
        data.msgSeq
      )
    },
    channel: {
      id: data.groupCode.toString(),
      type: Universal.Channel.Type.TEXT
    },
    guild: {
      id: data.groupCode.toString()
    },
    user: {
      id: data.operatorUin?.toString() ?? ''
    },
    member: {
      user: { id: data.operatorUin?.toString() ?? '' }
    },
    emoji: {
      id: data.faceId
    }
  }
}

export async function parseReactionAdded(
  bot: SatoriAdapter,
  data: NT.GroupMessageReactionEvent
) {
  return bot.event('reaction-added', buildReactionPayload(data))
}

export async function parseReactionRemoved(
  bot: SatoriAdapter,
  data: NT.GroupMessageReactionEvent
) {
  return bot.event('reaction-removed', buildReactionPayload(data))
}
