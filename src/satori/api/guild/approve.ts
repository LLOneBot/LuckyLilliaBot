import { Handler } from '../index'
import { GroupRequestOperateTypes } from '@/ntqqapi/types'
import { Dict } from 'cosmokit'

interface Payload {
  message_id: string
  approve: boolean
  comment: string
}

export const handleGuildRequest: Handler<Dict<never>, Payload> = async (ctx, payload) => {
  await ctx.ntGroupApi.handleGroupRequest(
    payload.message_id,
    payload.approve ? GroupRequestOperateTypes.Approve : GroupRequestOperateTypes.Reject,
    payload.comment
  )
  return {}
}
