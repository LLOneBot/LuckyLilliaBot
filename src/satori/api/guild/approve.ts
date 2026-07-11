import { decodeGroupRequestFlag } from '../../utils'
import { Handler } from '../index'
import { Dict } from 'cosmokit'

interface Payload {
  message_id: string
  approve: boolean
  comment: string
}

export const handleGuildRequest: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  const info = decodeGroupRequestFlag(payload.message_id)
  const result = await ctx.ntGroupApi.setGroupRequest(
    info.doubt,
    info.groupCode,
    info.seq,
    info.type,
    payload.approve,
    payload.comment
  )
  if (result.errorCode !== 0) {
    throw new Error(result.errorMsg)
  }
  return {}
}
