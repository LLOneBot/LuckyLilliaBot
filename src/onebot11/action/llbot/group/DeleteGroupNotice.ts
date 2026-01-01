import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

interface Payload {
  group_id: number | string
  notice_id: string
}

export class DeleteGroupNotice extends BaseAction<Payload, null> {
  actionName = ActionName.DeleteGroupNotice
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    notice_id: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.deleteGroupBulletin(payload.group_id.toString(), payload.notice_id)
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
