import BaseAction from '../BaseAction'
import { handleQuickOperation, QuickOperation, QuickOperationEvent } from '../../server/quick-operation'
import { log } from '@/common/utils'
import { ActionName } from '../types'

interface Payload{
  context: QuickOperationEvent,
  operation: QuickOperation
}

export class GoCQHTTHandleQuickOperation extends BaseAction<Payload, null>{
  actionName = ActionName.GoCQHTTP_HandleQuickOperation
  protected async _handle(payload: Payload): Promise<null> {
    handleQuickOperation(payload.context, payload.operation).then().catch(log);
    return null
  }
}