import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { getHttpEvent } from '../../helper/eventForHttp'
import { OB11Message } from '../../types'
import { OB11BaseEvent } from '../../event/OB11BaseEvent'

type PostEventType = OB11BaseEvent | OB11Message

interface Payload {
  key: string
  timeout: number
}

export default class GetEvent extends BaseAction<Payload, PostEventType[]> {
  actionName = ActionName.GetEvent
  protected async _handle(payload: Payload): Promise<PostEventType[]> {
    let key = ''
    if (payload.key) {
      key = payload.key
    }
    let timeout = parseInt(payload.timeout?.toString()) || 0
    let evts = await getHttpEvent(key, timeout)
    return evts
  }
}
