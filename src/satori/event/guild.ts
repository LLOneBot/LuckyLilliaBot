import SatoriAdapter from '../adapter'
import { RawMessage, GroupNotify } from '@/ntqqapi/types'
import { decodeGuild } from '../utils'

export async function parseGuildAdded(bot: SatoriAdapter, input: RawMessage) {
  const { groupAll } = await bot.ctx.ntGroupApi.getGroupAllInfo(input.peerUid)

  return bot.event('guild-added', {
    guild: decodeGuild(groupAll)
  })
}

export async function parseGuildRemoved(bot: SatoriAdapter, input: RawMessage) {
  const { groupAll } = await bot.ctx.ntGroupApi.getGroupAllInfo(input.peerUid)

  return bot.event('guild-removed', {
    guild: decodeGuild(groupAll)
  })
}

export async function parseGuildRequest(bot: SatoriAdapter, notify: GroupNotify) {
  const groupCode = notify.group.groupCode
  const flag = groupCode + '|' + notify.seq + '|' + notify.type

  return bot.event('guild-request', {
    guild: decodeGuild(notify.group),
    message: {
      id: flag,
      content: notify.postscript
    }
  })
}
