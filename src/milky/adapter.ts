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
} from './transform/event'
import { ChatType } from '@/ntqqapi/types'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    milky: MilkyAdapter
  }
}

export class MilkyAdapter extends Service {
  static inject = ['ntUserApi', 'ntFriendApi', 'ntGroupApi', 'ntMsgApi', 'ntFileApi', 'ntSystemApi', 'ntWebApi', 'app', 'qqProtocol', 'store']

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

    // Listen to NTQQ message created events
    this.ctx.on('nt/message-created', async (message) => {
      // 自己发送的消息（含其它终端 + 本端 OlPush 回声）：不要重复上报为 message_receive，
      // 但群操作（mute / admin / nudge / file_upload …）的 grayTip 系统消息 senderUid
      // 也是发起人的 uid，即 selfInfo.uid。这些必须照常走 transformXxxEvent —— 否则
      // 自己触发的群事件，自己端永远收不到对应事件。
      const isSelfSend = message.senderUid === selfInfo.uid
      const skipMessageReceive = isSelfSend && !this.config.reportSelfMessage
      if (message.chatType === ChatType.C2C) {
        // Private message
        if (!skipMessageReceive) {
          const eventData = await transformPrivateMessageCreated(this.ctx, message)
          if (eventData) {
            this.emitEvent('message_receive', eventData)
          }
        }
        const result = await transformPrivateMessageEvent(this.ctx, message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
        }
      } else if (message.chatType === ChatType.Group) {
        // Group message
        if (!skipMessageReceive) {
          const eventData = await transformGroupMessageCreated(this.ctx, message)
          if (eventData) {
            this.emitEvent('message_receive', eventData)
          }
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
        if (!skipMessageReceive) {
          const eventData = await transformTempMessageCreated(this.ctx, message)
          if (eventData) {
            this.emitEvent('message_receive', eventData)
          }
        }
        const result = await transformPrivateMessageEvent(this.ctx, message)
        if (result) {
          this.emitEvent(result.eventType, result.data)
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

    this.ctx.on('nt/kicked-offLine', async (info) => {
      this.emitEvent('bot_offline', {
        reason: info.tipsDesc
      })
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
  }
}

namespace MilkyAdapter {
  export interface Config extends MilkyConfig {
  }
}

export default MilkyAdapter
