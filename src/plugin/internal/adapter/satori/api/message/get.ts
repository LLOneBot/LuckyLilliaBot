import { Message } from '@satorijs/protocol'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  channel_id: string
  message_id: string
}

export const getMessage: Handler<Message, Payload> = (ctx, payload) => ntqq.getMessage(ctx, payload.message_id)
