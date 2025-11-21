import { GuildMember, List } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuildMember } from '../../utils'

interface Payload {
  guild_id: string
  next?: string
}

export const getGuildMemberList: Handler<List<GuildMember>, Payload> = async (ctx, payload) => {
  const res = await ctx.ntGroupApi.getGroupMembers(payload.guild_id)
  if (res.errCode !== 0) {
    throw new Error(res.errMsg)
  }
  return {
    data: res.result.infos.values().map(decodeGuildMember).toArray()
  }
}
