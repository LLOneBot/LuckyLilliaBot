import { describe, expect, it } from 'vitest'
import { PassiveReplies } from '@/universal/qqofficial/passive'

const MINUTE = 60_000

function tracker() {
  let now = 1_000_000
  const passive = new PassiveReplies(() => now)
  return { passive, advance: (ms: number) => { now += ms }, at: () => now }
}

describe('PassiveReplies', () => {
  it('replies to the latest message of the channel, counting msg_seq per message', () => {
    const { passive, at } = tracker()
    passive.remember({ id: 'm1', kind: 'message', scope: 'group', channelId: 'g', at: at() })
    passive.remember({ id: 'm2', kind: 'message', scope: 'group', channelId: 'g', at: at() })
    const latest = passive.pick('g')!
    expect(latest.id).toBe('m2')
    expect(passive.claim(latest)).toEqual({ msg_id: 'm2', msg_seq: 1 })
    expect(passive.claim(latest)).toEqual({ msg_id: 'm2', msg_seq: 2 })
    // The quoted message keeps its own sequence
    expect(passive.claim(passive.pick('g', 'm1')!)).toEqual({ msg_id: 'm1', msg_seq: 1 })
    expect(passive.pick('other')).toBeUndefined()
  })

  it('measures the window from when the message was sent', () => {
    const { passive, at, advance } = tracker()
    // Arrived late: sent four minutes and fifty-five seconds ago, inside the margin of the 5-minute window
    passive.remember({ id: 'late', kind: 'message', scope: 'group', channelId: 'g', at: at() - 4 * MINUTE - 55_000 })
    expect(passive.pick('g')).toBeUndefined()
    passive.remember({ id: 'c2c', kind: 'message', scope: 'c2c', channelId: 'private:u', at: at() })
    advance(30 * MINUTE)
    expect(passive.pick('private:u')?.id).toBe('c2c')
    advance(30 * MINUTE)
    expect(passive.pick('private:u')).toBeUndefined()
  })

  it('stops offering a message once its replies are used up or refused', () => {
    const { passive, at } = tracker()
    passive.remember({ id: 'g1', kind: 'message', scope: 'group', channelId: 'g', at: at() })
    passive.remember({ id: 'c1', kind: 'message', scope: 'c2c', channelId: 'private:u', at: at() })
    for (let i = 0; i < 5; i++) passive.claim(passive.pick('g')!)
    expect(passive.pick('g')).toBeUndefined()
    for (let i = 0; i < 4; i++) passive.claim(passive.pick('private:u')!)
    expect(passive.pick('private:u')).toBeUndefined()

    passive.remember({ id: 'g2', kind: 'message', scope: 'group', channelId: 'g', at: at() })
    passive.remember({ id: 'g3', kind: 'message', scope: 'group', channelId: 'g', at: at() })
    passive.exhaust(passive.pick('g')!)
    expect(passive.pick('g')?.id).toBe('g2')
  })

  it('cites events by event_id and ignores a quote from another channel', () => {
    const { passive, at } = tracker()
    passive.remember({ id: 'ev', kind: 'event', scope: 'group', channelId: 'g', at: at() })
    passive.remember({ id: 'elsewhere', kind: 'message', scope: 'group', channelId: 'h', at: at() })
    expect(passive.claim(passive.pick('g', 'elsewhere')!)).toEqual({ event_id: 'ev', msg_seq: 1 })
  })

  it('reports a message pushed twice', () => {
    const { passive, at } = tracker()
    expect(passive.remember({ id: 'm', kind: 'message', scope: 'group', channelId: 'g', at: at() })).toBe(true)
    expect(passive.remember({ id: 'm', kind: 'message', scope: 'group', channelId: 'g', at: at() })).toBe(false)
  })

  it('maps message ids to the REFIDX_ indexes quotes need, both ways', () => {
    const { passive, advance } = tracker()
    passive.rememberRef('m1', 'REFIDX_1')
    expect(passive.refOf('m1')).toBe('REFIDX_1')
    expect(passive.refOf('REFIDX_9')).toBe('REFIDX_9')
    expect(passive.messageIdOf('REFIDX_1')).toBe('m1')
    advance(61 * MINUTE)
    expect(passive.refOf('m1')).toBeUndefined()
    expect(passive.messageIdOf('REFIDX_1')).toBeUndefined()
  })
})
