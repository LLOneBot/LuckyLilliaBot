import { Dict } from 'cosmokit'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  guild_id: string
  user_id: string
  duration: number //毫秒
}

export const muteGuildMember: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ntqq.muteGuildMember(ctx, payload.guild_id, payload.user_id, payload.duration)
  return {}
}
