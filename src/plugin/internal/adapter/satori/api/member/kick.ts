import { Dict } from 'cosmokit'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  guild_id: string
  user_id: string
  permanent?: boolean
}

export const kickGuildMember: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ntqq.kickGuildMember(ctx, payload.guild_id, payload.user_id, Boolean(payload.permanent))
  return {}
}
