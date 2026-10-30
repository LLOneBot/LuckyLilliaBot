import { GuildMember, List } from '@satorijs/protocol'
import { Handler } from '..'
import { decodeGuildMember } from '@/plugin/internal/service/ntqq-universal/utils'

interface Payload {
  guild_id: string
  next?: string
}

export const getGuildMemberList: Handler<List<GuildMember>, Payload> = async (ctx, payload) => {
  const result = await ctx.ntGroupApi.getGroupMembers(+payload.guild_id, true)
  return {
    data: result.map(decodeGuildMember)
  }
}
