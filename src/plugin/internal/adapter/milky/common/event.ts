import { Event } from '../generated/schema'

export type MilkyEventTypes = {
  [K in Event['event_type']]: Extract<Event, { event_type: K }>['data']
}
