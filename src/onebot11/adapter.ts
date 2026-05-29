import { Context, Inject, Service } from 'cordis'
import { OB11Entities } from './entities'
import {
  ChatType,
  FriendRequest,
  GroupNotificationType,
  JsonGrayTipBusId,
  Peer,
  RawMessage,
} from '../ntqqapi/types'
import {
  OB11GroupRequestAddEvent,
  OB11GroupRequestInviteBotEvent,
} from './event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from './event/request/OB11FriendRequest'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { selfInfo } from '../common/globalVars'
import { Config as LLOBConfig, OB11Config } from '../common/types'
import { OB11WebSocket, OB11WebSocketReverse } from './connect/ws'
import { OB11Http, OB11HttpPost } from './connect/http'
import { OB11BaseEvent } from './event/OB11BaseEvent'
import { initActionMap } from './action'
import { OB11GroupAdminNoticeEvent } from './event/notice/OB11GroupAdminNoticeEvent'
import { OB11ProfileLikeEvent } from './event/notice/OB11ProfileLikeEvent'
import { Msg, Notify } from '@/ntqqapi/proto'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'
import { FlashFileDownloadStatus, FlashFileUploadStatus } from '@/ntqqapi/types/flashfile'
import {
  OB11FlashFile,
  OB11FlashFileDownloadedEvent,
  OB11FlashFileDownloadingEvent,
  OB11FlashFileUploadedEvent,
  OB11FlashFileUploadingEvent,
} from '@/onebot11/event/notice/OB11FlashFileEvent'
import {
  OB11FriendPokeEvent,
  OB11FriendPokeRecallEvent,
  OB11GroupPokeEvent,
  OB11GroupPokeRecallEvent,
} from '@/onebot11/event/notice/OB11PokeEvent'
import { OB11GroupDismissEvent } from '@/onebot11/event/notice/OB11GroupDismissEvent'
import { BaseAction } from './action/BaseAction'
import { cloneObj } from '@/common/utils'
import { OB11GroupMsgEmojiLikeEvent } from './event/notice/OB11MsgEmojiLikeEvent'
import { GroupEssenceEvent } from './event/notice/OB11GroupEssenceEvent'
import { GroupBanEvent } from './event/notice/OB11GroupBanEvent'
import { OB11GroupTitleEvent } from './event/notice/OB11GroupTitleEvent'
import { OB11FriendAddNoticeEvent } from './event/notice/OB11FriendAddNoticeEvent'
import { OB11GroupCardEvent } from './event/notice/OB11GroupCardEvent'
import { noop } from 'cosmokit'
import { encodeGroupRequestFlag } from './utils'

declare module 'cordis' {
  interface Context {
    onebot: Onebot11Adapter
  }
}

class Onebot11Adapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFriendApi',
    'ntGroupApi', 'ntUserApi', 'ntWebApi',
    'ntSystemApi', 'store', 'app',
    'qqProtocol', 'timer', 'config'
  ]
  private connect: (OB11Http | OB11HttpPost | OB11WebSocket | OB11WebSocketReverse)[]
  private actionMap: Map<string, BaseAction<unknown, unknown>>
  private reportOfflineMessage: boolean
  private reportSelfMessage: boolean
  // 直连模式下的 poke 缓存：msgUid → poke 事件信息，撤回时（nt/message-deleted）回查
  private pokeCache = new Map<string, {
    chatType: 'group' | 'friend'
    groupId?: number
    userId: number
    targetId: number
    rawInfo: unknown
  }>()

  constructor(public ctx: Context, public config: Onebot11Adapter.Config) {
    super(ctx, 'onebot')
    this.actionMap = initActionMap(this)
    this.reportOfflineMessage = false
    this.reportSelfMessage = false
    this.connect = config.connect.map(item => {
      if (item.reportOfflineMessage) {
        this.reportOfflineMessage = true
      }
      if (item.reportSelfMessage) {
        this.reportSelfMessage = true
      }
      if (item.type === 'http') {
        return new OB11Http(ctx, {
          ...item,
          actionMap: this.actionMap
        })
      } else if (item.type === 'http-post') {
        return new OB11HttpPost(ctx, item)
      } else if (item.type === 'ws') {
        return new OB11WebSocket(ctx, {
          ...item,
          actionMap: this.actionMap
        })
      } else if (item.type === 'ws-reverse') {
        return new OB11WebSocketReverse(ctx, {
          ...item,
          actionMap: this.actionMap
        })
      } else {
        throw new Error('incorrect ob11 connect type')
      }
    })
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  public dispatch(event: OB11BaseEvent) {
    for (const item of this.connect) {
      item.emitEvent(event)
    }
  }

  public dispatchMessageLike(event: OB11BaseEvent, self: boolean, offline: boolean) {
    for (const item of this.connect) {
      // 这里不 copy 出来的话，更改了 msg.message 会影响下一个 connect
      item.emitMessageLikeEvent(cloneObj(event), self, offline)
    }
  }

  private async handleMsg(message: RawMessage, self: boolean, offline: boolean) {
    if (offline && !this.reportOfflineMessage) {
      return
    }
    if (self && !this.reportSelfMessage) {
      return
    }

    OB11Entities.message(this.ctx, message).then(msg => {
      if (!msg) {
        return
      }
      const isSelfMsg = msg.user_id.toString() === selfInfo.uin
      if (isSelfMsg) {
        msg.target_id = +message.peerUin
      }
      this.dispatchMessageLike(msg, self, offline)
    }).catch(e => this.ctx.logger.error('handling incoming messages', e))

    OB11Entities.groupEvent(this.ctx, message).then(groupEvent => {
      if (groupEvent) {
        if (Array.isArray(groupEvent)) {
          for (const item of groupEvent) {
            this.dispatchMessageLike(item, self, offline)
          }
        } else {
          this.dispatchMessageLike(groupEvent, self, offline)
        }
      }
    }).catch(e => this.ctx.logger.error('handling incoming group events', e))

    OB11Entities.privateEvent(this.ctx, message).then(privateEvent => {
      if (privateEvent) {
        this.dispatchMessageLike(privateEvent, self, offline)
      }
    }).catch(e => this.ctx.logger.error('handling incoming buddy events', e))

    try {
      if (message.chatType === ChatType.Group) {
        const oldCard = await this.ctx.store.getGroupMemberCard(message.peerUid, message.senderUin)
        if (oldCard === undefined) {
          await this.ctx.store.setGroupMemberCard(message.peerUid, message.senderUin, message.sendMemberName)
        } else {
          const { peerName, peerUid, sendMemberName, sendNickName, senderUin } = message
          if (oldCard !== sendMemberName) {
            await this.ctx.store.setGroupMemberCard(peerUid, senderUin, sendMemberName)
            this.ctx.logger.info(`群 ${peerName}(${peerUid}) 的 ${sendMemberName || sendNickName}(${senderUin}) 更新了名片 ${oldCard} -> ${sendMemberName}`)
            const groupCardEvent = new OB11GroupCardEvent(
              +peerUid,
              +senderUin,
              sendMemberName,
              oldCard
            )
            this.dispatch(groupCardEvent)
          }
        }
      }
    } catch (e) {
      this.ctx.logger.error('handling group member name card change events', e)
    }
  }

  private handleRecallMsg(message: RawMessage) {
    const peer: Peer = {
      peerUid: message.peerUid,
      chatType: message.chatType,
      guildId: ''
    }
    // 直连模式：撤回戳一戳走 nt/raw/delete-msg → 这里 message.msgId 对应 contentHead.msgUid，
    // 命中 pokeCache 直接出 recall 事件
    const cachedPoke = this.pokeCache.get(message.msgId)
    if (cachedPoke) {
      this.pokeCache.delete(message.msgId)
      if (cachedPoke.chatType === 'group' && cachedPoke.groupId) {
        return this.dispatch(new OB11GroupPokeRecallEvent(
          cachedPoke.groupId, cachedPoke.userId, cachedPoke.targetId, cachedPoke.rawInfo,
        ))
      } else if (cachedPoke.chatType === 'friend') {
        return this.dispatch(new OB11FriendPokeRecallEvent(
          cachedPoke.userId, cachedPoke.targetId, cachedPoke.rawInfo,
        ))
      }
    }
    // 解析撤回戳一戳（wrapper 模式：通过 grayTipElement 拿到 poke 详情）
    const grayTipElement = message.elements.find(el => el.grayTipElement)?.grayTipElement
    if (grayTipElement && grayTipElement.jsonGrayTipElement?.busiId == JsonGrayTipBusId.Poke) {
      const json = JSON.parse(grayTipElement.jsonGrayTipElement.jsonStr)
      const templateParams = grayTipElement.jsonGrayTipElement?.xmlToJsonParam?.templParam
      const fromUserUin = templateParams?.get('uin_str1') || '0'
      const toUserUin = templateParams?.get('uin_str2') || '0'
      let recallEvent: OB11FriendPokeRecallEvent | OB11GroupPokeRecallEvent;
      if (peer.chatType === ChatType.Group) {
        recallEvent = new OB11GroupPokeRecallEvent(+message.peerUid, +fromUserUin, +toUserUin, json)
      }
      else {
        recallEvent = new OB11FriendPokeRecallEvent(+fromUserUin, +toUserUin, json)
      }
      return this.dispatch(recallEvent)
    }
    // OB11Entities.privateEvent(this.ctx, message).then(privateEvent => {
    //   if (privateEvent?.sub_type === 'poke') {
    //     (privateEvent as OB11FriendPokeEvent).sub_type = 'poke_recall'
    //     this.dispatch(privateEvent)
    //   }
    // })
    const shortId = this.ctx.store.createMsgShortId(message)

    OB11Entities.recallEvent(this.ctx, message, shortId).then((recallEvent) => {
      this.dispatch(recallEvent)
    }).catch(e => this.ctx.logger.error('handling recall events', e))
  }

  private async handleFriendRequest(req: FriendRequest) {
    const uin = await this.ctx.ntUserApi.getUinByUid(req.friendUid)
    const flag = req.friendUid
    const friendRequestEvent = new OB11FriendRequestEvent(
      +uin,
      req.extWords,
      flag,
      req.addSource ?? ''
    )
    this.dispatch(friendRequestEvent)
  }

  private async handleConfigUpdated(config: LLOBConfig) {
    for (const item of this.connect) {
      if (item.config.enable) {
        await item.stop()
      }
    }
    if (config.ob11.enable) {
      this.reportOfflineMessage = false
      this.reportSelfMessage = false
      this.connect = config.ob11.connect.map(item => {
        if (item.reportOfflineMessage) {
          this.reportOfflineMessage = true
        }
        if (item.reportSelfMessage) {
          this.reportSelfMessage = true
        }
        if (item.type === 'http') {
          return new OB11Http(this.ctx, {
            ...item,
            actionMap: this.actionMap
          })
        } else if (item.type === 'http-post') {
          return new OB11HttpPost(this.ctx, item)
        } else if (item.type === 'ws') {
          return new OB11WebSocket(this.ctx, {
            ...item,
            actionMap: this.actionMap
          })
        } else if (item.type === 'ws-reverse') {
          return new OB11WebSocketReverse(this.ctx, {
            ...item,
            actionMap: this.actionMap
          })
        } else {
          throw new Error('incorrect ob11 connect type')
        }
      })
      for (const item of this.connect) {
        if (item.config.enable) {
          item.start()
        }
      }
    }
    Object.assign(this.config, {
      ...config.ob11,
      msgCacheExpire: config.msgCacheExpire,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url,
      ffmpeg: config.ffmpeg,
    })
  }

  public start() {
    if (this.config.enable) {
      for (const item of this.connect) {
        if (item.config.enable) {
          item.start()
        }
      }
    }
    this.ctx.on('llob/config-updated', input => {
      this.handleConfigUpdated(input).catch(noop)
    })
    this.ctx.on('nt/message-created', (input: RawMessage) => {
      // 其他终端自己发送的消息会进入这里
      if (input.senderUid === selfInfo.uid) {
        this.handleMsg(input, true, false)
      }
      else {
        this.handleMsg(input, false, false)
      }
    })
    this.ctx.on('nt/offline-message-created', (input: RawMessage) => {
      // 其他终端自己发送的消息会进入这里
      if (input.senderUid === selfInfo.uid) {
        this.handleMsg(input, true, true)
      }
      else {
        this.handleMsg(input, false, true)
      }
    })
    this.ctx.on('nt/message-deleted', input => {
      this.handleRecallMsg(input)
    })
    // 直连模式下 poke 没有对应的 RawMessage，core 那边 getMsgsByMsgId 会失败、永远到不了 nt/message-deleted。
    // 这里直接监听 raw 层的 delete-msg，命中 pokeCache 就出撤回戳一戳事件。
    this.ctx.on('nt/raw/delete-msg', payload => {
      const [, msgIds] = payload
      for (const msgId of msgIds) {
        const cached = this.pokeCache.get(msgId)
        if (!cached) continue
        this.pokeCache.delete(msgId)
        if (cached.chatType === 'group' && cached.groupId) {
          this.dispatch(new OB11GroupPokeRecallEvent(
            cached.groupId, cached.userId, cached.targetId, cached.rawInfo,
          ))
        } else if (cached.chatType === 'friend') {
          this.dispatch(new OB11FriendPokeRecallEvent(
            cached.userId, cached.targetId, cached.rawInfo,
          ))
        }
      }
    })
    this.ctx.on('nt/message-sent', input => {
      this.handleMsg(input, true, false)
    })
    this.ctx.on('nt/friend-request', input => {
      this.handleFriendRequest(input)
    })
    this.ctx.on('nt/raw/group-poke', input => {
      const groupId = +input.groupCode
      const userId = +input.fromUin   // operator
      const targetId = +input.toUin   // target
      if (!groupId || !userId || !targetId) return
      const rawInfo: Record<string, unknown>[] = [
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: String(userId) },
        { col: '1', jp: '', txt: input.action || '戳了戳', type: 'nor' },
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: String(targetId) },
      ]
      if (input.suffix) {
        rawInfo.push({ col: '1', jp: '', txt: input.suffix, type: 'nor' })
      }
      if (input.actionImg) {
        rawInfo.push({ src: input.actionImg, type: 'img' })
      }
      if (input.msgUid && input.msgUid !== '0') {
        this.pokeCache.set(input.msgUid, { chatType: 'group', groupId, userId, targetId, rawInfo })
        if (this.pokeCache.size > 500) {
          const firstKey = this.pokeCache.keys().next().value
          if (firstKey) this.pokeCache.delete(firstKey)
        }
      }
      this.dispatch(new OB11GroupPokeEvent(groupId, userId, targetId, rawInfo))
    })
    this.ctx.on('nt/raw/friend-poke', input => {
      const userId = +input.fromUin   // operator
      const targetId = +input.toUin   // target
      if (!userId || !targetId) return
      const rawInfo: Record<string, unknown>[] = [
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: String(userId) },
        { col: '1', jp: '', txt: input.action || '戳了戳', type: 'nor' },
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: String(targetId) },
      ]
      if (input.suffix) {
        rawInfo.push({ col: '1', jp: '', txt: input.suffix, type: 'nor' })
      }
      if (input.actionImg) {
        rawInfo.push({ src: input.actionImg, type: 'img' })
      }
      if (input.msgUid && input.msgUid !== '0') {
        this.pokeCache.set(input.msgUid, { chatType: 'friend', userId, targetId, rawInfo })
        if (this.pokeCache.size > 500) {
          const firstKey = this.pokeCache.keys().next().value
          if (firstKey) this.pokeCache.delete(firstKey)
        }
      }
      this.dispatch(new OB11FriendPokeEvent(userId, targetId, rawInfo))
    })
    this.ctx.on('nt/raw/group-reaction', async input => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const operatorUin = input.operatorUid
          ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid)
          : '0'
        const peer = {
          chatType: ChatType.Group,
          peerUid: groupId.toString(),
          guildId: ''
        }
        const cached = this.ctx.store.getMsgBySeq(peer.peerUid, input.msgSeq)
        let messageId
        if (cached) {
          messageId = this.ctx.store.createMsgShortId(cached)
        } else {
          const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(peer, input.msgSeq)
          messageId = this.ctx.store.createMsgShortId(msgList[0])
        }
        this.dispatch(new OB11GroupMsgEmojiLikeEvent(
          groupId,
          +operatorUin,
          messageId,
          [{ emoji_id: input.code, count: input.count }],
          input.isAdd,
        ))
      } catch (e) {
        this.ctx.logger.warn('group-reaction bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/raw/group-mute', async input => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const targetUin = input.targetUid
          ? await this.ctx.ntUserApi.getUinByUid(input.targetUid)
          : '0'
        const operatorUin = input.operatorUid
          ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid)
          : '0'
        const subType = input.duration > 0 ? 'ban' : 'lift_ban'
        this.dispatch(new GroupBanEvent(groupId, +targetUin, +operatorUin, input.duration, subType))
      } catch (e) {
        this.ctx.logger.warn('group-mute bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/raw/group-mute-all', async input => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const operatorUin = input.operatorUid
          ? await this.ctx.ntUserApi.getUinByUid(input.operatorUid)
          : '0'
        // 0 表示全员禁言。开启用 -1，解除用 0（OB11 约定）
        const duration = input.isMute ? -1 : 0
        const subType = input.isMute ? 'ban' : 'lift_ban'
        this.dispatch(new GroupBanEvent(groupId, 0, +operatorUin, duration, subType))
      } catch (e) {
        this.ctx.logger.warn('group-mute-all bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/raw/group-essence-change', async input => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        const peer = {
          chatType: ChatType.Group,
          peerUid: groupId.toString(),
          guildId: ''
        }
        const cached = this.ctx.store.getMsgBySeq(peer.peerUid, input.msgSequence)
        let messageId, senderId
        if (cached) {
          messageId = this.ctx.store.createMsgShortId(cached)
          senderId = +cached.senderUin
        } else {
          const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(peer, input.msgSequence)
          messageId = this.ctx.store.createMsgShortId(msgList[0])
          senderId = +msgList[0].senderUin
        }
        this.dispatch(new GroupEssenceEvent(
          groupId,
          messageId,
          senderId,
          +input.operatorUin,
          input.isAdd ? 'add' : 'delete',
        ))
      } catch (e) {
        this.ctx.logger.warn('group-essence-change bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/raw/group-title-changed', async input => {
      const groupId = +input.groupCode
      if (!groupId) return
      try {
        // memberUin 在 templateParams 里有可能是 uin，也有可能是 uid，统一兜底处理
        let userId = +input.memberUin
        if (!userId && input.memberUin?.startsWith('u_')) {
          const uin = await this.ctx.ntUserApi.getUinByUid(input.memberUin)
          userId = +uin
        }
        if (!userId) return
        this.dispatch(new OB11GroupTitleEvent(groupId, userId, input.title))
      } catch (e) {
        this.ctx.logger.warn('group-title-changed bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/raw/friend-added', async input => {
      try {
        let userId = +input.peerUin
        if (!userId && input.peerUid) {
          const uin = await this.ctx.ntUserApi.getUinByUid(input.peerUid)
          userId = +uin
        }
        if (!userId) return
        this.dispatch(new OB11FriendAddNoticeEvent(userId))
      } catch (e) {
        this.ctx.logger.warn('friend-added bridge error:', (e as Error).message)
      }
    })
    this.ctx.on('nt/system-message-created', async input => {
      const sysMsg = Msg.Message.decode(input)
      if (!sysMsg.body) {
        return
      }
      const { msgType, subType } = sysMsg.contentHead
      if (msgType === 528 && subType === 39) {
        const tip = Notify.ProfileLike.decode(sysMsg.body.msgContent)
        if (tip.msgType !== 0 || tip.subType !== 203) return
        const detail = tip.content?.msg?.detail
        if (!detail) return
        const [times] = detail.txt?.match(/\d+/) ?? ['0']
        const event = new OB11ProfileLikeEvent(detail.uin, detail.nickname, +times)
        this.dispatch(event)
      }
      else if (msgType === 33) {
        const tip = Notify.GroupMemberChange.decode(sysMsg.body.msgContent)
        if (tip.type !== 130) return
        this.ctx.logger.info('群成员增加', tip)
        const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
        const operatorUin = await this.ctx.ntUserApi.getUinByUid(tip.adminUid)
        const event = new OB11GroupIncreaseEvent(tip.groupCode, +memberUin, +operatorUin)
        this.dispatch(event)
      }
      else if (msgType === 34) {
        const tip = Notify.GroupMemberChange.decode(sysMsg.body.msgContent)
        if (tip.type === 130) {
          this.ctx.logger.info('群成员减少', tip)
          const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
          const userId = Number(memberUin)
          const event = new OB11GroupDecreaseEvent(tip.groupCode, userId, userId)
          this.dispatch(event)
        } else if (tip.type === 131) {
          if (tip.memberUid === selfInfo.uid) return
          this.ctx.logger.info('有群成员被踢', tip)
          const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
          let adminUin = 0
          let adminUid = tip.adminUid
          if (adminUid) {
            const adminUidMatch = tip.adminUid.match(/\x18([^\x18\x10]+)\x10/)
            if (adminUidMatch) {
              adminUid = adminUidMatch[1]
            }
            adminUin = await this.ctx.ntUserApi.getUinByUid(adminUid)
          }
          const event = new OB11GroupDecreaseEvent(tip.groupCode, +memberUin, adminUin, 'kick')
          this.dispatch(event)
        } else if (tip.type === 3) {
          // bot 自己被踢出群（群解散时也会触发 type=3，operatorUid 是群主）
          this.ctx.logger.info('bot 被踢出群/群解散', tip)
          let adminUin = 0
          let adminUid = tip.adminUid
          if (adminUid) {
            const adminUidMatch = tip.adminUid.match(/\x18([^\x18\x10]+)\x10/)
            if (adminUidMatch) {
              adminUid = adminUidMatch[1]
            }
            adminUin = await this.ctx.ntUserApi.getUinByUid(adminUid)
          }
          const event = new OB11GroupDecreaseEvent(tip.groupCode, +selfInfo.uin, adminUin, 'kick_me')
          this.dispatch(event)
        }
      }
      else if (msgType === 528 && subType === 321) {
        // 私聊撤回戳一戳，不再从这里解析，应从 nt/message-deleted 事件中解析
      }
      else if (msgType === 732 && subType === 21) {
        // 撤回群戳一戳，不再从这里解析，应从 nt/message-deleted 事件中解析
      } else if (msgType === 44) {
        const tip = Notify.GroupAdminChange.decode(sysMsg.body.msgContent)
        this.ctx.logger.info('收到管理员变动通知', tip)
        const uid = tip.isPromote ? tip.body.extraEnable?.adminUid : tip.body.extraDisable?.adminUid
        if (!uid) return null
        const uin = await this.ctx.ntUserApi.getUinByUid(uid)
        const event = new OB11GroupAdminNoticeEvent(
          tip.isPromote ? 'set' : 'unset',
          tip.groupCode,
          +uin,
        )
        this.dispatch(event)
      }
    })

    this.ctx.on('nt/flash-file-download-status', input => {
      if (input.status === FlashFileDownloadStatus.DOWNLOADED) {
        const files: OB11FlashFile[] = []
        this.ctx.ntFileApi.getFlashFileList(input.info.fileSetId).then((res) => {
          for (const file of res) {
            for (const file2 of file.fileList) {
              files.push({
                name: file2.name,
                size: +file2.filePhysicalSize,
                path: file2.saveFilePath,
              })
            }
          }
          const event = new OB11FlashFileDownloadedEvent(
            input.info.name,
            input.info.shareInfo.shareLink,
            input.info.fileSetId,
          )
          this.dispatch(event)
        }).catch((err) => {
          this.ctx.logger.error(err, { fileSetId: input.info.fileSetId })
        })

      }
    })

    this.ctx.on('nt/flash-file-upload-status', fileSetInfo => {
      if (fileSetInfo.uploadStatus === FlashFileUploadStatus.UPLOADED) {
        const event = new OB11FlashFileUploadedEvent(
          fileSetInfo.name,
          fileSetInfo.shareInfo.shareLink,
          fileSetInfo.fileSetId,
        )
        this.dispatch(event)
      }
    })

    this.ctx.on('nt/flash-file-downloading', input => {
      const [fileSetId, downloadingInfo] = input
      this.ctx.ntFileApi.getFlashFileInfo(fileSetId, false).then((res) => {
        this.ctx.ntFileApi.getFlashFileList(fileSetId, false).then((fileList) => {
          const files: OB11FlashFile[] = []
          for (const file of fileList) {
            for (const file2 of file.fileList) {
              files.push({
                name: file2.name,
                size: +file2.filePhysicalSize,
                path: file2.saveFilePath,
              })
            }
          }
          const event = new OB11FlashFileDownloadingEvent(
            res.name,
            res.shareInfo.shareLink,
            fileSetId,
            +downloadingInfo.curDownLoadedBytes,
            +downloadingInfo.totalDownLoadedBytes,
            downloadingInfo.curSpeedBps,
            downloadingInfo.remainDownLoadSeconds,
            files,
          )
          this.dispatch(event)
        }).catch((err) => {
          this.ctx.logger.error(err)
        })

      }).catch((err) => {
        this.ctx.logger.error(err)
      })
    })

    this.ctx.on('nt/flash-file-uploading', info => {
      this.ctx.ntFileApi.getFlashFileList(info.fileSet.fileSetId, false).then(fileList => {
        const files: OB11FlashFile[] = []
        for (const file of fileList) {
          for (const file2 of file.fileList) {
            files.push({
              name: file2.name,
              size: +file2.filePhysicalSize,
              path: file2.physical.localPath,
            })
          }
        }

        const event = new OB11FlashFileUploadingEvent(
          info.fileSet.name,
          info.fileSet.shareInfo.shareLink,
          info.fileSet.fileSetId,
          +info.uploadedFileSize,
          +info.fileSet.totalFileSize,
          +info.uploadSpeed,
          +info.timeRemain,
          files,
        )
        this.dispatch(event)
      })

    })

    this.ctx.on('nt/group-dismiss', async (group) => {
      const groupInfo = await this.ctx.ntGroupApi.getGroup(+group.groupCode, false)
      const ownerUin = await this.ctx.ntUserApi.getUinByUid(groupInfo.ownerUid)
      const event = new OB11GroupDismissEvent(
        +group.groupCode,
        +ownerUin
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-quit', async (group) => {
      const event = new OB11GroupDecreaseEvent(
        Number(group.groupCode),
        Number(selfInfo.uin),
        Number(selfInfo.uin),
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-join-request', async (data) => {
      const userId = await this.ctx.ntUserApi.getUinByUid(data.initiatorUid)
      const event = new OB11GroupRequestAddEvent(
        data.groupCode,
        userId,
        encodeGroupRequestFlag(data.groupCode, data.notificationSeq, GroupNotificationType.JoinRequest, data.isDoubt),
        data.comment,
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-invited-join-request', async (data) => {
      const userId = await this.ctx.ntUserApi.getUinByUid(data.targetUserUid)
      const invitorId = await this.ctx.ntUserApi.getUinByUid(data.initiatorUid)
      const event = new OB11GroupRequestAddEvent(
        data.groupCode,
        userId,
        encodeGroupRequestFlag(data.groupCode, data.notificationSeq, GroupNotificationType.InvitedJoinRequest, false),
        '',
        invitorId,
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-invitation', async (data) => {
      const userId = await this.ctx.ntUserApi.getUinByUid(data.initiatorUid)
      const event = new OB11GroupRequestInviteBotEvent(
        data.groupCode,
        userId,
        encodeGroupRequestFlag(data.groupCode, data.invitationSeq, GroupNotificationType.Invitation, false),
        ''
      )
      this.dispatch(event)
    })
  }
}

namespace Onebot11Adapter {
  export interface Config extends OB11Config {
    musicSignUrl?: string
    enableLocalFile2Url: boolean
    ffmpeg?: string
  }
}

export default Onebot11Adapter
