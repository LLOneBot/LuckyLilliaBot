import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  channel_id: string
  duration: number
}

export const muteChannel: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const result = await ctx.ntGroupApi.muteGroup(+payload.channel_id, payload.duration !== 0)
  if (result.errorCode !== 0) {
    throw new Error(result.errorMsg)
  }
  return {}
}
