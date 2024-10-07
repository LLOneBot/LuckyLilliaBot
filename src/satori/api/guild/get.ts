import { Guild } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuild } from '../../utils'

interface Payload {
  guild_id: string
}

export const getGuild: Handler<Guild, Payload> = async (ctx, payload) => {
  const info = await ctx.ntGroupApi.getGroupAllInfo(payload.guild_id)
  return decodeGuild(info.groupAll)
}
