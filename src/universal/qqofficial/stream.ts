import type { Stream } from './types'

const LIMIT = 500

/**
 * Streaming replies (Koishi adapter-qq-crack, stream.ts). Each reply to the same message continues the stream
 * the first one opened, by its message id and the next index; there the state hangs on the Koishi session,
 * here on the message the replies cite.
 */
export class StreamStates {
  private states = new Map<string, { id?: string; index: number }>()

  /** Fills in the stream fields unless the request brings its own. */
  apply(key: string | undefined, request: { stream?: Stream }, enabled: boolean) {
    if (!enabled || request.stream || !key) return
    const state = this.states.get(key)
    request.stream = { state: 1, id: state?.id, index: state?.index ?? 0, reset: false }
  }

  /** After a successful send: the next part continues from here, unless this one ended the stream. */
  update(key: string | undefined, request: { stream?: Stream }, messageId?: string) {
    if (!key || !request.stream) return
    if (request.stream.reset || request.stream.state >= 10) {
      this.states.delete(key)
      return
    }
    this.states.delete(key)
    this.states.set(key, { id: messageId || request.stream.id, index: (request.stream.index ?? 0) + 1 })
    while (this.states.size > LIMIT) this.states.delete(this.states.keys().next().value!)
  }

  clear(key: string | undefined) {
    if (key) this.states.delete(key)
  }
}
