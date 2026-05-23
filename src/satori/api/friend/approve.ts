import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  message_id: string
  approve: boolean
  comment?: string
}

export const handleFriendRequest: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ctx.ntFriendApi.approvalFriendRequest(payload.message_id, payload.approve)
  return {}
}
