import { BaseAction, Schema } from '../BaseAction'
import { handleQuickOperation, QuickOperation, QuickOperationEvent } from '../../helper/quickOperation'
import { ActionName } from '../types'

interface Payload {
  context: QuickOperationEvent,
  operation: QuickOperation
}

export class HandleQuickOperation extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_HandleQuickOperation
  payloadSchema = Schema.object({
    context: Schema.any().required(),
    operation: Schema.any().required(),
  })

  protected async _handle(payload: Payload) {
    handleQuickOperation(this.ctx, payload.context, payload.operation).catch(e => this.ctx.logger.error(e))
    return null
  }
}
