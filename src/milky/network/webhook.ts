import type { MilkyAdapter } from '@/milky/adapter'
import { Context } from 'cordis'
import { MilkyWebhookConfig } from '@/common/types'

class MilkyWebhookHandler {
  private activated: boolean = false

  constructor(readonly milkyAdapter: MilkyAdapter, readonly ctx: Context, readonly config: MilkyWebhookHandler.Config) { }

  start() {
    this.activated = true
  }

  stop() {
    this.activated = false
  }

  async broadcast(msg: string) {
    if (!this.activated || this.config.urls.length === 0) {
      return
    }
    const sendResult = await Promise.allSettled(this.config.urls.map(async (url) => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: msg,
        })
      } catch (e) {
        this.ctx.logger.warn(
          'MilkyWebhook',
          `Failed to send message to ${url}: ${e instanceof Error ? e.stack : e}`
        )
        throw e
      }
    }))
    this.ctx.logger.debug(
      'MilkyWebhook',
      `Broadcasted message to ${sendResult.filter(result => result.status === 'fulfilled').length} URLs`
    )
  }

  updateConfig(config: Partial<MilkyWebhookHandler.Config>) {
    Object.assign(this.config, config)
  }
}

namespace MilkyWebhookHandler {
  export interface Config extends MilkyWebhookConfig {
  }
}

export { MilkyWebhookHandler }
