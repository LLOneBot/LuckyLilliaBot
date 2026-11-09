import { Status } from '@satorijs/protocol'
import type { QQOfficialConfig } from '@/common/types'
import type { Stream } from './types'
import type { QQOfficialStats } from './statsTypes'
export type { QQOfficialStats } from './statsTypes'

interface Identity {
  status: number
  user: { name?: string; avatar?: string }
}

/** Local to one enable of the plugin; gateway reconnects keep the same counters. */
export class QQOfficialStatsTracker {
  private readonly appId: string
  private readonly configured: boolean
  private readonly sandbox: boolean
  private readonly startedAt = Date.now()
  private messageReceived = 0
  private messageSent = 0
  private lastMessageAt?: number

  constructor(config: Pick<QQOfficialConfig, 'appId' | 'secret' | 'sandbox'>) {
    this.appId = config.appId
    this.configured = !!config.appId.trim() && !!config.secret
    this.sandbox = config.sandbox
  }

  received() {
    this.messageReceived++
    this.lastMessageAt = Date.now()
  }

  sent(stream?: Stream) {
    // A C2C stream is one message, regardless of the number of successful continuation parts.
    if (stream?.id || (stream?.index ?? 0) > 0) return
    this.messageSent++
    this.lastMessageAt = Date.now()
  }

  snapshot(bot?: Identity): QQOfficialStats {
    return {
      appId: this.appId,
      name: bot?.user.name,
      avatar: bot?.user.avatar,
      status: bot?.status ?? Status.OFFLINE,
      configured: this.configured,
      sandbox: this.sandbox,
      messageReceived: this.messageReceived,
      messageSent: this.messageSent,
      startedAt: this.startedAt,
      lastMessageAt: this.lastMessageAt,
    }
  }
}
