import { GuildMember } from '@satorijs/protocol'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  guild_id: string
  user_id: string
}

export const getGuildMember: Handler<GuildMember, Payload> = (ctx, payload) =>
  ntqq.getGuildMember(ctx, payload.guild_id, payload.user_id)
