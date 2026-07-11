import { Channel } from '@satorijs/protocol'
import { Handler } from '../index'

interface Payload {
  channel_id: string
}

export const getChannel: Handler<Channel, Payload> = async (ctx, payload) => {
  const info = await ctx.ntGroupApi.getGroup(+payload.channel_id, true)
  return {
    id: payload.channel_id,
    type: Channel.Type.TEXT,
    name: info.groupName
  }
}
