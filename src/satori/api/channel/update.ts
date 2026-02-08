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
    const res = await ctx.ntGroupApi.setGroupName(payload.channel_id, payload.data.name)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
  }
  return {}
}
