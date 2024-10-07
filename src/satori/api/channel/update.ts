import { Channel } from '@satorijs/protocol'
import { Handler } from '../index'
import { ObjectToSnake } from 'ts-case-convert'
import { Dict } from 'cosmokit'

interface Payload {
  channel_id: string
  data: ObjectToSnake<Channel>
}

export const updateChannel: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  if (payload.data.name) {
    await ctx.ntGroupApi.setGroupName(payload.channel_id, payload.data.name)
  }
  return {}
}
