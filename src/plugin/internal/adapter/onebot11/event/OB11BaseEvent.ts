import { selfInfo } from '@/common/globalVars'

export enum EventType {
  META = 'meta_event',
  REQUEST = 'request',
  NOTICE = 'notice',
  MESSAGE = 'message',
  MESSAGE_SENT = 'message_sent',
}

export abstract class OB11BaseEvent {
  [index: string]: any
  time = Math.floor(Date.now() / 1000)
  self_id = +selfInfo.uin
  abstract post_type: EventType

  getSummaryEventName() {
    return this.post_type + '.' + this[(this.post_type === 'message_sent' ? 'message' : this.post_type) + '_type']
  }
}
