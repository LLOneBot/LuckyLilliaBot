import { Message } from '@satorijs/protocol'
import { MessageEncoder } from '../../message'
import { Handler } from '../index'

interface Payload {
  channel_id: string
  content: string
}

export const createMessage: Handler<Message[], Payload> = async (ctx, payload) => {
  const encoder = new MessageEncoder(ctx, payload.channel_id)
  return await encoder.send(payload.content)
}
