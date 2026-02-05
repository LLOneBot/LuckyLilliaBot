import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { getHttpEvent } from '../../../helper/eventForHttp'
import { OB11Message } from '../../../types'
import { OB11BaseEvent } from '../../../event/OB11BaseEvent'

type PostEventType = OB11BaseEvent | OB11Message

interface Payload {
  key: string
  timeout: number | string
}

export class GetEvent extends BaseAction<Payload, PostEventType[]> {
  actionName = ActionName.GetEvent
  payloadSchema = Schema.object({
    key: Schema.string(),
    timeout: Schema.union([Number, String])
  })

  protected async _handle(payload: Payload): Promise<PostEventType[]> {
    let key = ''
    if (payload.key) {
      key = payload.key
    }
    const timeout = +payload.timeout?.toString() || 0
    const evts = await getHttpEvent(key, timeout)
    return evts
  }
}
