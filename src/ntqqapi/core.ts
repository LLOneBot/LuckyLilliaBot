import { unlink } from 'node:fs/promises'
import { Service, Context } from 'cordis'
import { Config as LLOBConfig } from '../common/types'
import {
  Peer,
  SendMessageElement,
  GroupJoinRequestEvent,
  GroupInvitedJoinRequestEvent,
  GroupInvitationEvent,
  MessageDeletedEvent,
  GroupRemovedEvent,
  GroupAddedEvent,
  GroupMemberAddedEvent,
  GroupDisbandEvent,
  GroupMemberRemovedEvent,
  GroupMemberCardNameChangedEvent,
  FriendRequestEvent,
  FriendRemovedEvent,
  FriendAddedEvent,
  FriendNudgeEvent,
  GroupNudgeEvent,
  GroupMemberSpecialTitleChangedEvent,
  GroupNameChangedEvent,
  GroupWholeMuteEvent,
  GroupMuteEvent,
  GroupAdminChangedEvent,
  PinChangedEvent,
  GroupMessageReactionEvent,
  GroupEssenceMessageChangedEvent,
  ProfileLikeEvent,
  PttTransResultEvent,
  KickedOfflineEvent,
  MessageCreatedEvent,
  ChatType,
  MessageSentEvent,
  StatusChangedEvent,
  GroupMemberRole,
} from './types'
import { logSummaryMessage } from '@/ntqqapi/log'
import { setFFMpegPath } from '@/common/utils/ffmpeg'
import { registerDispatcher } from './dispatcher'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    app: Core
  }

  interface Events {
    // Raw QQ protocol push: { cmd, payload } from PMHQ recv or direct push
    'qq/raw': (input: { cmd: string, payload: Buffer }) => void

    'nt/message-created': (input: MessageCreatedEvent) => void
    'nt/message-deleted': (input: MessageDeletedEvent) => void
    'nt/message-sent': (input: MessageSentEvent) => void
    'nt/group-join-request': (input: GroupJoinRequestEvent) => void
    'nt/group-invited-join-request': (input: GroupInvitedJoinRequestEvent) => void
    'nt/group-invitation': (input: GroupInvitationEvent) => void
    'nt/group-added': (input: GroupAddedEvent) => void
    'nt/group-removed': (input: GroupRemovedEvent) => void
    'nt/group-disband': (input: GroupDisbandEvent) => void
    'nt/group-nudge': (input: GroupNudgeEvent) => void
    'nt/group-name-changed': (input: GroupNameChangedEvent) => void
    'nt/group-admin-changed': (input: GroupAdminChangedEvent) => void
    'nt/group-message-reaction': (input: GroupMessageReactionEvent) => void
    'nt/group-essence-message-changed': (input: GroupEssenceMessageChangedEvent) => void
    'nt/group-whole-mute': (input: GroupWholeMuteEvent) => void
    'nt/group-mute': (input: GroupMuteEvent) => void
    'nt/group-member-added': (input: GroupMemberAddedEvent) => void
    'nt/group-member-removed': (input: GroupMemberRemovedEvent) => void
    'nt/group-member-card-name-changed': (input: GroupMemberCardNameChangedEvent) => void
    'nt/group-member-special-title-changed': (input: GroupMemberSpecialTitleChangedEvent) => void
    'nt/friend-request': (input: FriendRequestEvent) => void
    'nt/friend-added': (input: FriendAddedEvent) => void
    'nt/friend-removed': (input: FriendRemovedEvent) => void
    'nt/friend-nudge': (input: FriendNudgeEvent) => void
    'nt/profile-like': (input: ProfileLikeEvent) => void
    'nt/pin-changed': (input: PinChangedEvent) => void
    'nt/ptt-trans-result': (input: PttTransResultEvent) => void
    'nt/kicked-offline': (input: KickedOfflineEvent) => void
    'nt/status-changed': (input: StatusChangedEvent) => void
  }
}

class Core extends Service {
  static inject = [
    'ntMsgApi', 'ntFriendApi', 'store',
    'ntFileApi', 'ntGroupApi', 'ntUserApi'
  ]
  public startupTime = 0
  public messageReceivedCount = 0
  public messageSentCount = 0
  public lastMessageTime = 0

  constructor(protected ctx: Context, public config: Core.Config) {
    super(ctx, 'app')
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  public start() {
    this.startupTime = Math.trunc(Date.now() / 1000)
    this.registerListener()
    registerDispatcher(this.ctx)
    setFFMpegPath('')
    this.ctx.on('llob/config-updated', input => {
      Object.assign(this.config, input)
      setFFMpegPath(input.ffmpeg || '')
    })
  }

  public async sendMessage(
    ctx: Context,
    peer: Peer,
    sendElements: SendMessageElement[],
    deleteAfterSentFiles: string[],
  ) {
    if (peer.chatType === ChatType.Group) {
      const info = await ctx.ntGroupApi.getGroup(+peer.peerUid, false)
      if (
        info.personShutupExpireTime * 1000 > Date.now()
        || (info.groupShutupExpireTime * 1000 > Date.now()
          && info.memberRole === GroupMemberRole.Normal)
      ) {
        deleteAfterSentFiles.forEach(path => {
          unlink(path).catch(noop)
        })
        throw new Error('当前处于被禁言状态')
      }
    }
    if (!sendElements.length) {
      deleteAfterSentFiles.forEach(path => {
        unlink(path).catch(noop)
      })
      throw new Error('消息体无法解析，请检查是否发送了不支持的消息类型')
    }
    try {
      const returnMsg = await ctx.ntMsgApi.sendMsg(peer, sendElements)
      this.messageSentCount++
      if (returnMsg.chatType !== ChatType.Group) {
        // 由于私聊消息发送后没有回声，不会触发 nt/message-sent，所以补一个
        // 而且，该事件不能早于 ntMsgApi.waitForSelfEcho 上报
        this.ctx.parallel('nt/message-sent', {
          message: returnMsg
        })
      }
      return returnMsg
    } finally {
      deleteAfterSentFiles.forEach(path => {
        unlink(path).catch(noop)
      })
    }
  }

  private registerListener() {
    this.ctx.on('nt/message-created', (data) => {
      this.ctx.store.addMsgCache(data.message)
      this.lastMessageTime = data.message.msgTime
      this.messageReceivedCount++
      logSummaryMessage(this.ctx, data.message)
    })

    this.ctx.on('nt/message-sent', (data) => {
      this.ctx.store.addMsgCache(data.message)
    })
  }
}

namespace Core {
  export interface Config extends LLOBConfig {
  }
}

export default Core
