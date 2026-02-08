import { Guild, List } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuild } from '../../utils'

interface Payload {
  next?: string
}

export const getGuildList: Handler<List<Guild>, Payload> = async (ctx) => {
  const groups = await ctx.ntGroupApi.getGroups(true)
  return {
    data: groups.map(decodeGuild)
  }
}
