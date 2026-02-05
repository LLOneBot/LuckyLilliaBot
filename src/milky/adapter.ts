import { Context, Service } from 'cordis'
import { MilkyConfig } from '@/common/types'
import { MilkyApiCollection } from './common/api'
import { MilkyHttpHandler } from './network/http'
import { MilkyWebhookHandler } from './network/webhook'
import { MilkyEventTypes } from './common/event'
import { SystemApi } from './api/system'
import { MessageApi } from './api/message'
import { FriendApi } from './api/friend'
import { GroupApi } from './api/group'
import { FileApi } from './api/file'
import { selfInfo } from '@/common/globalVars'
import {
  transformPrivateMessageCreated,
  transformGroupMessageCreated,
  transformPrivateMessageDeleted,
  transformGroupMessageDeleted,
  transformGroupNotify,
  transformFriendRequestEvent,
  transformSystemMessageEvent,
  transformGroupMessageEvent,
  transformPrivateMessageEvent,
  transformOlpushEvent,
  transformTempMessageCreated,
} from './transform/event'
import { ChatType } from '@/ntqqapi/types'

declare module 'cordis' {
  interface Context {
    milky: MilkyAdapter
  }
}

export class MilkyAdapter extends Service {
  static inject = ['ntUserApi', 'ntFriendApi', 'ntGroupApi', 'ntMsgApi', 'ntFileApi', 'ntSystemApi', 'ntWebApi', 'app']

  readonly apiCollection!: MilkyApiCollection
  readonly httpHandler!: MilkyHttpHandler
  readonly webhookHandler!: MilkyWebhookHandler
  private listenedEvent = false

  constructor(ctx: Context, public config: MilkyAdapter.Config) {
    super(ctx, 'milky', true)

    this.apiCollection = new MilkyApiCollection(ctx, [
      ...SystemApi,
      ...MessageApi,
      ...FriendApi,
      ...GroupApi,
      ...FileApi,
    ])

    this.httpHandler = new MilkyHttpHandler(this, ctx, config.http)
    this.webhookHandler = new MilkyWebhookHandler(this, ctx, config.webhook)
  }


  async start() {
    this.ctx.on('llob/config-updated', (config) => {
      this.httpHandler.stop()
      this.webhookHandler.stop()
      this.httpHandler.updateConfig(config.milky.http)
      this.webhookHandler.updateConfig(config.milky.webhook)
      if (config.milky.enable) {
        this.httpHandler.start()
        this.webhookHandler.start()
        this.setupEventListeners()
      }
      this.config = config.milky
    })

    if (!this.config.enable) {
      return
    }

    this.httpHandler.start()
    this.webhookHandler.start()
    this.setupEventListeners()
  }

  async stop() {
    if (!this.config.enable) {
      return
    }

    this.httpHandler.stop()
  }

  emitEvent<E extends keyof MilkyEventTypes>(eventName: E, data: MilkyEventTypes[E]) {
    const selfUin = selfInfo.uin
    const eventString = JSON.stringify({
      time: Math.floor(Date.now() / 1000),
      self_id: +selfUin,
      event_type: eventName,
      data: data,
    })
    this.httpHandler.broadcast(eventString)
    this.webhookHandler.broadcast(eventString)
  }

  private setupEventListeners() {
    if (this.listenedEvent) return
    this.listenedEvent = true

    // Listen to NTQQ message created events
    this.ctx.on('nt/message-created', async (message) => {
      // 其他终端自己发送的消息会进入这里
      if (message.senderUid === selfInfo.uid && !this.config.reportSelfMessage) {
        return
      }
      if (message.chatType === ChatType.C2C) {
        // Private message
        const eventData = await transformPrivateMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformPrivateMessageEvent(this.ctx, message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      } else if (message.chatType === ChatType.Group) {
        // Group message
        const eventData = await transformGroupMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformGroupMessageEvent(this.ctx, message)
        if (result) {
          if (Array.isArray(result)) {
            for (const item of result) {
              this.emitEvent(item.eventType, item.data)
            }
          } else {
            this.emitEvent(result.eventType, result.data)
          }
        }
      } else if (message.chatType === ChatType.TempC2CFromGroup) {
        // Temp message
        const eventData = await transformTempMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformPrivateMessageEvent(this.ctx, message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      }
    })

    // Listen to NTQQ message deleted events
    this.ctx.on('nt/message-deleted', async (message) => {
      if (message.chatType === ChatType.C2C) {
        const eventData = await transformPrivateMessageDeleted(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      } else if (message.chatType === ChatType.Group) {
        const eventData = await transformGroupMessageDeleted(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      }
    })

    // Listen to NTQQ message sent events (self messages)
    this.ctx.on('nt/message-sent', async (message) => {
      if (!this.config.reportSelfMessage) {
        return
      }
      if (message.chatType === ChatType.C2C) {
        const eventData = await transformPrivateMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      } else if (message.chatType === ChatType.Group) {
        const eventData = await transformGroupMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      } else if (message.chatType === ChatType.TempC2CFromGroup) {
        const eventData = await transformTempMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      }
    })

    // Listen to NTQQ group notify events
    this.ctx.on('nt/group-notify', async ({ notify, doubt }) => {
      const result = await transformGroupNotify(this.ctx, notify, doubt)
      if (result) {
        this.emitEvent(result.eventType, result.data)
      }
    })

    // Listen to NTQQ friend request events
    this.ctx.on('nt/friend-request', async (request) => {
      const eventData = await transformFriendRequestEvent(this.ctx, request)
      if (eventData) {
        this.emitEvent('friend_request', eventData)
      }
    })

    this.ctx.on('nt/system-message-created', async (data) => {
      const result = await transformSystemMessageEvent(this.ctx, data)
      if (result) {
        this.emitEvent(result.eventType, result.data)
      }
    })

    this.ctx.on('nt/kicked-offLine', async (info) => {
      this.emitEvent('bot_offline', {
        reason: info.tipsDesc
      })
    })

    this.ctx.app.pmhq.addResListener(async (data) => {
      if (data.type === 'recv' && data.data.cmd === 'trpc.msg.olpush.OlPushService.MsgPush') {
        const result = await transformOlpushEvent(this.ctx, Buffer.from(data.data.pb, 'hex'))
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      }
    })
  }
}

namespace MilkyAdapter {
  export interface Config extends MilkyConfig {
  }
}

export default MilkyAdapter
