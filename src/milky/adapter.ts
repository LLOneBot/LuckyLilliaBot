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
  transformFriendRequestEvent,
  transformSystemMessageEvent,
  transformGroupMessageEvent,
  transformPrivateMessageEvent,
  transformOlpushEvent,
  transformTempMessageCreated,
  transformTempMessageDeleted,
  transformGroupJoinRequestEvent,
  transformGroupInvitedJoinRequestEvent,
  transformGroupInvitationEvent,
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

    // Listen to NTQQ message deleted events
    this.ctx.on('nt/message-deleted', async (data) => {
      if (data.chatType === ChatType.C2C) {
        const eventData = await transformPrivateMessageDeleted(this.ctx, data)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      } else if (data.chatType === ChatType.Group) {
        const eventData = await transformGroupMessageDeleted(this.ctx, data)
        if (eventData) {
          this.emitEvent('message_recall', eventData)
        }
      } else if (data.chatType === ChatType.TempC2CFromGroup) {
        const eventData = await transformTempMessageDeleted(this.ctx, data)
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

    this.ctx.qqProtocol.addResListener(async (data) => {
      if (data.type === 'recv' && data.data.cmd === 'trpc.msg.olpush.OlPushService.MsgPush') {
        const result = await transformOlpushEvent(this.ctx, Buffer.from(data.data.pb, 'hex'))
        if (result) {
          this.emitEvent(result.eventType, result.data)
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

    // ========== nt/raw/* 细粒度事件桥接 ==========
    // dispatcher 把不同 OlPush 系统消息解成独立事件后单独发出来（OB11 一直监听这些），
    // milky adapter 之前没接，导致 group_mute / group_essence_message_change /
    // group_message_reaction / group_nudge / friend_nudge / group_name_change /
    // friend_file_upload 这些事件全收不到。这里全部接上。

    this.ctx.on('nt/raw/group-mute', async (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const userIdRaw = input.targetUid ? await this.ctx.ntUserApi.getUinByUid(input.targetUid) : '0'
        const opIdRaw = input.operatorUid ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid) : '0'
        if (input.targetUid) {
          // 单人禁言
          this.emitEvent('group_mute', {
            group_id: groupId,
            user_id: +userIdRaw,
            operator_id: +opIdRaw,
            duration: input.duration,
          } as MilkyEventTypes['group_mute'])
        }
      } catch (e) {
        this.ctx.logger.warn('milky group-mute bridge error:', (e as Error).message)
      }
    })

    this.ctx.on('nt/raw/group-mute-all', async (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const opIdRaw = input.operatorUid ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid) : '0'
        this.emitEvent('group_whole_mute', {
          group_id: groupId,
          operator_id: +opIdRaw,
          is_mute: input.isMute,
        } as MilkyEventTypes['group_whole_mute'])
      } catch (e) {
        this.ctx.logger.warn('milky group-mute-all bridge error:', (e as Error).message)
      }
    })

    this.ctx.on('nt/raw/group-essence-change', async (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        this.emitEvent('group_essence_message_change', {
          group_id: groupId,
          message_seq: input.msgSequence,
          operator_id: +input.operatorUin,
          is_set: input.isAdd,
        } as MilkyEventTypes['group_essence_message_change'])
      } catch (e) {
        this.ctx.logger.warn('milky group-essence-change bridge error:', (e as Error).message)
      }
    })

    this.ctx.on('nt/raw/group-name-changed', async (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const operatorId = input.operatorUid
          ? Number(await this.ctx.ntUserApi.getUinByUid(input.operatorUid))
          : 0
        this.emitEvent('group_name_change', {
          group_id: groupId,
          new_group_name: input.newName,
          operator_id: operatorId,
        } as MilkyEventTypes['group_name_change'])
      } catch (e) {
        this.ctx.logger.warn('milky group-name-change bridge error:', (e as Error).message)
      }
    })

    this.ctx.on('nt/raw/group-reaction', async (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const userIdRaw = input.operatorUid ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid) : '0'
        // milky reaction_type 推断：emoji code 是单字符串，QQ 内置表情 face 反之
        // 简单按 isDigit 区分
        const reactionType: 'face' | 'emoji' = /^\d+$/.test(input.code) ? 'face' : 'emoji'
        this.emitEvent('group_message_reaction', {
          group_id: groupId,
          user_id: +userIdRaw,
          message_seq: input.msgSeq,
          face_id: input.code,
          reaction_type: reactionType,
          is_add: input.isAdd,
        } as MilkyEventTypes['group_message_reaction'])
      } catch (e) {
        this.ctx.logger.warn('milky group-reaction bridge error:', (e as Error).message)
      }
    })

    this.ctx.on('nt/raw/group-poke', (input) => {
      const groupId = +input.groupCode
      if (!groupId) return
      this.emitEvent('group_nudge', {
        group_id: groupId,
        sender_id: +input.fromUin,
        receiver_id: +input.toUin,
        display_action: input.action,
        display_suffix: input.suffix,
        display_action_img_url: input.actionImg,
      } as MilkyEventTypes['group_nudge'])
    })

    this.ctx.on('nt/raw/friend-poke', (input) => {
      // milky friend_nudge.data 形状跟 group_nudge 不一样：用 user_id + is_self_send / is_self_receive
      // 而不是 sender_id / receiver_id。
      const fromUin = +input.fromUin
      const toUin = +input.toUin
      const meUin = +selfInfo.uin
      // user_id = 对方的 uin（不管自己是发起方还是接收方）
      const userId = fromUin === meUin ? toUin : fromUin
      this.emitEvent('friend_nudge', {
        user_id: userId,
        is_self_send: fromUin === meUin,
        is_self_receive: toUin === meUin,
        display_action: input.action,
        display_suffix: input.suffix,
        display_action_img_url: input.actionImg,
      } as MilkyEventTypes['friend_nudge'])
    })
  }
}

namespace MilkyAdapter {
  export interface Config extends MilkyConfig {
  }
}

export default MilkyAdapter
