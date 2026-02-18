import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  channel_id: string
}

export const deleteChannel: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const res = await ctx.ntGroupApi.quitGroup(payload.channel_id)
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
