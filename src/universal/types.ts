import { Context } from 'cordis'
import type { Event } from '@satorijs/protocol'
import type { ObjectToSnake } from 'ts-case-convert'

export type SatoriEvent = ObjectToSnake<Event>

/**
 * All the NT -> Satori event converters in src/plugin/internal/service/ntqq-universal/event need from whoever
 * builds the envelope.
 */
export interface NormalizeHost {
  readonly ctx: Context
  event(type: string, data: Partial<SatoriEvent>): SatoriEvent
}
