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
  transformFriendRequestEvent,
  transformGroupMessageEvent,
  transformPrivateMessageEvent,
  transformTempMessageCreated,
  transformGroupJoinRequestEvent,
  transformGroupInvitedJoinRequestEvent,
  transformGroupInvitationEvent,
  transformGroupMemberIncreaseEvent,
  transformGroupMemberDecreaseEvent,
  transformFriendMessageRecall,
  transformGroupMessageRecall,
  transformTempMessageRecall,
  transformFriendNudgeEvent,
  transformGroupNudgeEvent,
  transformGroupNameChangeEvent,
  transformGroupWholeMuteEvent,
  transformGroupMuteEvent,
  transformGroupAdminChangeEvent,
  transformPeerPinChangeEvent,
  transformGroupEssenceMessageChangeEvent,
  transformGroupMessageReactionEvent,
  transformBotOfflineEvent,
  transformGroupDisbandEvent,
} from './transform/event'
import { ChatType } from '@/ntqqapi/types'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    milky: MilkyAdapter
  }
}

export class MilkyAdapter extends Service {
  static inject = [
    'ntUserApi', 'ntFriendApi', 'ntGroupApi',
    'ntMsgApi', 'ntFileApi', 'ntSystemApi',
    'ntWebApi', 'app', 'store'
  ]

  readonly apiCollection!: MilkyApiCollection
  readonly httpHandler!: MilkyHttpHandler
  readonly webhookHandler!: MilkyWebhookHandler
  private listenedEvent = false

  constructor(ctx: Context, public config: MilkyAdapter.Config) {
    super(ctx, 'milky')

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

  async [Service.init]() {
    this.start()
    return noop
  }

  start() {
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

    this.ctx.on('nt/message-created', async (data) => {
      // 自己发送的消息不会进这里，而是走 nt/message-sent
      if (data.message.chatType === ChatType.C2C) {
        // Private message
        const eventData = await transformPrivateMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformPrivateMessageEvent(this.ctx, data.message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      } else if (data.message.chatType === ChatType.Group) {
        // Group message
        const eventData = await transformGroupMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformGroupMessageEvent(this.ctx, data.message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      } else if (data.message.chatType === ChatType.TempC2CFromGroup) {
        // Temp message
        const eventData = await transformTempMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
        const result = await transformPrivateMessageEvent(this.ctx, data.message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      }
    })

    this.ctx.on('nt/message-deleted', async (data) => {
      if (data.chatType === ChatType.C2C) {
        const eventData = await transformFriendMessageRecall(this.ctx, data)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      } else if (data.chatType === ChatType.Group) {
        const eventData = await transformGroupMessageRecall(this.ctx, data)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      } else if (data.chatType === ChatType.TempC2CFromGroup) {
        const eventData = await transformTempMessageRecall(this.ctx, data)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      }
    })

    this.ctx.on('nt/message-sent', async (data) => {
      if (!this.config.reportSelfMessage) {
        return
      }
      if (data.message.chatType === ChatType.C2C) {
        const eventData = await transformPrivateMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      } else if (data.message.chatType === ChatType.Group) {
        const eventData = await transformGroupMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      } else if (data.message.chatType === ChatType.TempC2CFromGroup) {
        const eventData = await transformTempMessageCreated(this.ctx, data.message)
        if (eventData) {
          this.emitEvent('message_receive', eventData)
        }
      }
    })

    this.ctx.on('nt/group-join-request', async (data) => {
      const eventData = await transformGroupJoinRequestEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_join_request', eventData)
      }
    })

    this.ctx.on('nt/group-invited-join-request', async (data) => {
      const eventData = await transformGroupInvitedJoinRequestEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_invited_join_request', eventData)
      }
    })

    this.ctx.on('nt/group-invitation', async (data) => {
      const eventData = await transformGroupInvitationEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_invitation', eventData)
      }
    })

    this.ctx.on('nt/group-disband', async (data) => {
      const eventData = await transformGroupDisbandEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_disband', eventData)
      }
    })

    this.ctx.on('nt/group-nudge', async (data) => {
      const eventData = await transformGroupNudgeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_nudge', eventData)
      }
    })

    this.ctx.on('nt/group-message-reaction', async (data) => {
      const eventData = await transformGroupMessageReactionEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_message_reaction', eventData)
      }
    })

    this.ctx.on('nt/group-essence-message-changed', async (data) => {
      const eventData = await transformGroupEssenceMessageChangeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_essence_message_change', eventData)
      }
    })

    this.ctx.on('nt/group-whole-mute', async (data) => {
      const eventData = await transformGroupWholeMuteEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_whole_mute', eventData)
      }
    })

    this.ctx.on('nt/group-mute', async (data) => {
      const eventData = await transformGroupMuteEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_mute', eventData)
      }
    })

    this.ctx.on('nt/group-name-changed', async (data) => {
      const eventData = await transformGroupNameChangeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_name_change', eventData)
      }
    })

    this.ctx.on('nt/group-admin-changed', async (data) => {
      const eventData = await transformGroupAdminChangeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_admin_change', eventData)
      }
    })

    this.ctx.on('nt/group-member-added', async (data) => {
      const eventData = await transformGroupMemberIncreaseEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_member_increase', eventData)
      }
    })

    this.ctx.on('nt/group-member-removed', async (data) => {
      const eventData = await transformGroupMemberDecreaseEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('group_member_decrease', eventData)
      }
    })

    this.ctx.on('nt/friend-request', async (data) => {
      const eventData = await transformFriendRequestEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('friend_request', eventData)
      }
    })

    this.ctx.on('nt/friend-nudge', async (data) => {
      const eventData = await transformFriendNudgeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('friend_nudge', eventData)
      }
    })

    this.ctx.on('nt/pin-changed', async (data) => {
      const eventData = await transformPeerPinChangeEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('peer_pin_change', eventData)
      }
    })

    this.ctx.on('nt/kicked-offline', async (data) => {
      const eventData = await transformBotOfflineEvent(this.ctx, data)
      if (eventData) {
        this.emitEvent('bot_offline', eventData)
      }
    })
  }
}

namespace MilkyAdapter {
  export interface Config extends MilkyConfig {
  }
}

export default MilkyAdapter
