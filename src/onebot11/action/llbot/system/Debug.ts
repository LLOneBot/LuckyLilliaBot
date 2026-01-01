import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  apiClass: string
  method: string
  args: unknown[]
}

export default class Debug extends BaseAction<Payload, unknown> {
  actionName = ActionName.Debug
  payloadSchema = Schema.object({
    apiClass: Schema.string().required(),
    method: Schema.string().required(),
    args: Schema.array(Schema.any()).default([])
  })

  protected async _handle(payload: Payload) {
    this.ctx.logger.info('debug call ntqq api', payload)
    const api = this.ctx.get(payload.apiClass)
    return await api[payload.method](...payload.args)
  }
}
