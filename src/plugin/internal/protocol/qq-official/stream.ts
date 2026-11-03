import type { Context } from 'cordis'
import type { Stream } from './types'

const LIMIT = 500
/** A stream that went this long without a part is ended for the plugin */
export const STREAM_IDLE = 10_000

interface Open {
  /** The message id the platform keeps the stream under */
  id?: string
  index: number
  /** Parts gathered for a target without streams, sent as one message when the stream ends */
  gathered?: string[]
  disposeTimer?: () => void
}

/**
 * Streaming replies, keyed by the message or event the replies cite. In C2C each part continues the stream the
 * first one opened, by its message id and the next index. Groups have no streams (2026-10-31: every part came out
 * as a message of its own), so there the parts gather instead. A stream ends with its end part, or STREAM_IDLE
 * after its last part.
 */
export class StreamStates {
  private states = new Map<string, Open>()

  constructor(private ctx: Context) {}

  /** A stream is open on this message or event: a part went out, or was gathered, and none ended it. */
  has(key: string): boolean {
    return this.states.has(key)
  }

  /** Fills in the stream fields unless the request brings its own. */
  apply(key: string | undefined, request: { stream?: Stream }, enabled: boolean, end = false) {
    if (!enabled || request.stream || !key) return
    const state = this.states.get(key)
    request.stream = { state: end ? 10 : 1, id: state?.id, index: state?.index ?? 0, reset: false }
  }

  /** After a successful send: the next part continues from here, unless this one ended the stream. */
  update(key: string | undefined, request: { stream?: Stream }, messageId?: string) {
    if (!key || !request.stream) return
    if (request.stream.reset || request.stream.state >= 10) {
      this.drop(key)
      return
    }
    const state = this.states.get(key) ?? { index: 0 }
    state.id = messageId || request.stream.id
    state.index = (request.stream.index ?? 0) + 1
    this.states.delete(key)
    this.states.set(key, state)
    this.evict()
  }

  /** Keeps a part for a target without streams. */
  gather(key: string, content: string) {
    const state = this.states.get(key) ?? { index: 0 }
    state.gathered = [...state.gathered ?? [], content]
    this.states.delete(key)
    this.states.set(key, state)
    this.evict()
  }

  /** The gathered parts, if the stream gathered any; the stream is over either way. */
  take(key: string): string | undefined {
    const gathered = this.states.get(key)?.gathered
    this.drop(key)
    return gathered?.join('')
  }

  isGathering(key: string): boolean {
    return !!this.states.get(key)?.gathered
  }

  /** Runs `end` once the stream has gone STREAM_IDLE without a part; another part sets the clock back. */
  arm(key: string, end: () => void) {
    const state = this.states.get(key)
    if (!state) return
    state.disposeTimer?.()
    state.disposeTimer = this.ctx.timeout(() => {
      state.disposeTimer = undefined
      if (this.states.get(key) === state) end()
    }, STREAM_IDLE)
  }

  /** Forgets the stream without ending it. */
  clear(key: string | undefined) {
    if (key) this.drop(key)
  }

  private drop(key: string) {
    this.states.get(key)?.disposeTimer?.()
    this.states.delete(key)
  }

  private evict() {
    while (this.states.size > LIMIT) this.drop(this.states.keys().next().value!)
  }
}
