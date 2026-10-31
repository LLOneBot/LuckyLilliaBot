import type { Context } from 'cordis'
import { describe, expect, it } from 'vitest'
import { STREAM_IDLE, StreamStates } from '@/plugin/internal/protocol/qq-official/stream'
import type { Stream } from '@/plugin/internal/protocol/qq-official/types'

function clock() {
  const timers = new Set<{ run: () => void; delay: number }>()
  const ctx = {
    timeout(run: () => void, delay: number) {
      const timer = { run, delay }
      timers.add(timer)
      return () => timers.delete(timer)
    },
  } as unknown as Context
  const fire = () => {
    for (const timer of [...timers]) {
      timers.delete(timer)
      timer.run()
    }
  }
  return { streams: new StreamStates(ctx), timers, fire }
}

const part = () => ({} as { stream?: Stream })

describe('StreamStates', () => {
  it('ends a stream gone quiet once, every part setting the clock back', () => {
    const { streams, timers, fire } = clock()
    const ended: string[] = []
    const first = part()
    streams.apply('m', first, true)
    streams.update('m', first, 'S1')
    streams.arm('m', () => ended.push('m'))
    const second = part()
    streams.apply('m', second, true)
    expect(second.stream).toEqual({ state: 1, id: 'S1', index: 1, reset: false })
    streams.update('m', second, 'S1')
    streams.arm('m', () => ended.push('m'))
    expect([...timers].map(timer => timer.delay)).toEqual([STREAM_IDLE])
    fire()
    expect(ended).toEqual(['m'])
  })

  it('stops the clock when the stream ends or is forgotten', () => {
    const { streams, timers } = clock()
    const first = part()
    streams.apply('m', first, true)
    streams.update('m', first, 'S1')
    streams.arm('m', () => {})
    const end = part()
    streams.apply('m', end, true, true)
    expect(end.stream).toEqual({ state: 10, id: 'S1', index: 1, reset: false })
    streams.update('m', end, 'S1')
    expect(streams.has('m')).toBe(false)
    expect(timers.size).toBe(0)

    streams.gather('g', 'a')
    streams.arm('g', () => {})
    streams.clear('g')
    expect(timers.size).toBe(0)
  })

  it('hands the gathered parts over once, joined', () => {
    const { streams } = clock()
    streams.gather('g', 'a')
    streams.gather('g', 'b')
    expect(streams.has('g')).toBe(true)
    expect(streams.isGathering('g')).toBe(true)
    expect(streams.take('g')).toBe('ab')
    expect(streams.has('g')).toBe(false)
    expect(streams.take('g')).toBeUndefined()
  })
})
