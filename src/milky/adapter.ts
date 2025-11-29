import { Context, Service } from 'cordis'
import { MilkyConfig } from './common/config'
import { MilkyApiCollection } from './common/api'
import { MilkyHttpHandler } from './network/http'
import { MilkyWebhookHandler } from './network/webhook'
import { MilkyEventTypes } from './common/event'
import { SystemApi } from './api/system'
import { MessageApi } from './api/message'
import { FriendApi } from './api/friend'
import { GroupApi } from './api/group'
import { FileApi } from './api/file'
import path from 'node:path'
import { writeFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { selfInfo, TEMP_DIR } from '@/common/globalVars'
import {
  transformPrivateMessageCreated,
  transformGroupMessageCreated,
  transformPrivateMessageDeleted,
  transformGroupMessageDeleted,
  transformGroupNotify,
  transformFriendRequestEvent,
  transformGroupMemberInfoUpdated,
} from './transform/event'
import { ChatType } from '@/ntqqapi/types'

declare module 'cordis' {
  interface Context {
    milky: MilkyAdapter
  }
}

export class MilkyAdapter extends Service {
  static inject = ['ntUserApi', 'ntFriendApi', 'ntGroupApi', 'ntMsgApi', 'ntFileApi', 'app']

  readonly apiCollection!: MilkyApiCollection
  readonly httpHandler!: MilkyHttpHandler
  readonly webhookHandler!: MilkyWebhookHandler

  constructor(ctx: Context, public config: MilkyConfig) {
    super(ctx, 'milky', true)

    if (!config.enable) {
      ctx.logger.info('Milky adapter is disabled')
      return
    }

    this.apiCollection = new MilkyApiCollection(ctx, [
      ...SystemApi,
      ...MessageApi,
      ...FriendApi,
      ...GroupApi,
      ...FileApi,
    ])

    this.httpHandler = new MilkyHttpHandler(this, ctx, config.http)
    this.webhookHandler = new MilkyWebhookHandler(this, ctx, config.webhook)

    ctx.logger.info('Milky adapter initialized')
  }


  async start() {
    if (!this.config.enable) {
      return
    }

    this.httpHandler.start()
    this.setupEventListeners()

    this.ctx.logger.info('Milky adapter started')
  }

  async stop() {
    if (!this.config.enable) {
      return
    }

    this.httpHandler.stop()
    this.ctx.logger.info('Milky adapter stopped')
  }

  emitEvent<E extends keyof MilkyEventTypes>(eventName: E, data: MilkyEventTypes[E]) {
    const selfUin = selfInfo.uin
    const eventString = JSON.stringify({
      time: Math.floor(Date.now() / 1000),
      self_id: parseInt(selfUin),
      event_type: eventName,
      data: data,
    })
    this.httpHandler.broadcast(eventString)
    this.webhookHandler.broadcast(eventString)
  }

  async saveToTempFile(buffer: Buffer, prefix: string): Promise<string> {
    const tempPath = path.join(TEMP_DIR, `${prefix}-${randomUUID()}`)
    await writeFile(tempPath, buffer)
    return tempPath
  }

  async deleteTempFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
    } catch (error) {
      this.ctx.logger.warn('Failed to delete temp file:', error)
    }
  }

  private setupEventListeners() {
    // Listen to NTQQ message created events
    this.ctx.on('nt/message-created', async (message) => {
      if (message.chatType === ChatType.C2C) {
        // Private message
        const eventData = await transformPrivateMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      } else if (message.chatType === ChatType.Group) {
        // Group message
        const eventData = await transformGroupMessageCreated(this.ctx, message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      }
    })

    // Listen to NTQQ offline message created events
    this.ctx.on('nt/offline-message-created', async (message) => {
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
      }
    })

    // Listen to NTQQ group notify events
    this.ctx.on('nt/group-notify', async ({ notify, doubt }) => {
      const result = await transformGroupNotify(this.ctx, notify)
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

    // Listen to NTQQ group member info updated events
    this.ctx.on('nt/group-member-info-updated', async (data) => {
      // TODO: Implement group member info updated event transformation
      const eventData = await transformGroupMemberInfoUpdated(this.ctx, data)
      if (eventData) {
        // this.emitEvent(eventData.eventType, eventData.data)
      }
    })

    // TODO: Listen to flash file events
    // this.ctx.on('nt/flash-file-uploading', async (data) => { ... })
    // this.ctx.on('nt/flash-file-upload-status', async (data) => { ... })
    // this.ctx.on('nt/flash-file-download-status', async (data) => { ... })
    // this.ctx.on('nt/flash-file-downloading', async (data) => { ... })

    // TODO: Listen to system message events
    // this.ctx.on('nt/system-message-created', async (data) => { ... })

    // TODO: Listen to QR code login events
    // this.ctx.on('nt/login-qrcode', async (data) => { ... })

    this.ctx.logger.info('Milky event listeners set up')
  }
}

export default MilkyAdapter
