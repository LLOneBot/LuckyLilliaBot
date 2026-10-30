import { Message } from '@satorijs/protocol'
import { MessageEncoder } from '@/plugin/internal/service/ntqq-universal/message'
import { Handler } from '..'

interface Payload {
  channel_id: string
  content: string
}

export const createMessage: Handler<Message[], Payload> = async (ctx, payload) => {
  const encoder = new MessageEncoder(ctx, payload.channel_id)
  return await encoder.send(payload.content)
}
