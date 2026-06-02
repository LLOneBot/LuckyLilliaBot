import SatoriAdapter from '../adapter'
import * as NT from '@/ntqqapi/types'
import * as Universal from '@satorijs/protocol'
import { encodeMessageId } from '../utils'

export async function parseReactionAdded(
  bot: SatoriAdapter,
  data: NT.GroupMessageReactionEvent
) {
  return bot.event('reaction-added', {
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
    emoji: {
      id: data.faceId
    }
  })
}

export async function parseReactionRemoved(
  bot: SatoriAdapter,
  data: NT.GroupMessageReactionEvent
) {
  return bot.event('reaction-removed', {
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
    emoji: {
      id: data.faceId
    }
  })
}
