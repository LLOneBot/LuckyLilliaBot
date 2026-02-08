import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  channel_id: string
  duration: number
}

export const muteChannel: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const res = await ctx.ntGroupApi.banGroup(payload.channel_id, payload.duration !== 0)
  if (res.result !== 0) {
    throw new Error(res.errMsg)
  }
  return {}
}
