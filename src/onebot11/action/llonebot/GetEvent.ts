import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { getHttpEvent } from '../../server/event-for-http'
import { PostEventType } from '../../server/post-ob11-event'
// import { log } from "../../../common/utils";

interface Payload {
  key: string
  timeout: number
}

export default class GetEvent extends BaseAction<Payload, PostEventType[]> {
  actionName = ActionName.GetEvent
  protected async _handle(payload: Payload): Promise<PostEventType[]> {
    let key = ''
    if (payload.key) {
      key = payload.key;
    }
    let timeout = parseInt(payload.timeout?.toString()) || 0;
    let evts = await getHttpEvent(key,timeout);
    return evts;
  }
}
