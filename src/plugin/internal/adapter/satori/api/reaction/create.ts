import { Dict } from 'cosmokit'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  channel_id: string
  message_id: string
  emoji_id: string
}

export const createReaction: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ntqq.createReaction(ctx, payload.message_id, payload.emoji_id)
  return {}
}
