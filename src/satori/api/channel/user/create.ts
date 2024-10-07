import { Channel } from '@satorijs/protocol'
import { Handler } from '../../index'

interface Payload {
  user_id: string
  guild_id?: string
}

export const createDirectChannel: Handler<Channel, Payload> = async (ctx, payload) => {
  return {
    id: 'private:' + payload.user_id,
    type: Channel.Type.DIRECT
  }
}
