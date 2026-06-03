import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  channel_id: string
}

export const deleteChannel: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const result = await ctx.ntGroupApi.quitGroup(+payload.channel_id)
  if (result.errorCode !== 0) {
    throw new Error(result.errorMsg)
  }
  return {}
}
