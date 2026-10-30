import { Dict } from 'cosmokit'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  channel_id: string
  message_id: string
}

export const deleteMessage: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ntqq.deleteMessage(ctx, payload.message_id)
  return {}
}
