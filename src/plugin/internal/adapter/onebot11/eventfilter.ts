import sift from 'sift'
import { OB11BaseEvent } from './event/OB11BaseEvent'

export function matchEventFilter(filter: unknown, event: OB11BaseEvent): boolean {
  if (filter === undefined || filter === null) {
    return true
  }

  try {
    const tester = sift(filter)
    return tester(event)
  } catch {
    return false
  }
}
