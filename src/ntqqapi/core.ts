import { unlink } from 'node:fs/promises'
import { Service, Context } from 'cordis'
import { Config as LLOBConfig } from '../common/types'
import {
  RawMessage,
  FriendRequestNotify,
  FriendRequest,
  BuddyReqType,
  ChatType,
  Peer,
  SendMessageElement,
  KickedOffLineInfo,
  GroupJoinRequestEvent,
  GroupInvitedJoinRequestEvent,
  GroupInvitationEvent,
  MessageDeleteEvent,
  GroupRemovedEvent,
  GroupAddedEvent,
  GroupMemberAddedEvent,
  GroupDisbandEvent,
  GroupMemberRemovedEvent,
  GroupMemberCardNameChangedEvent,
} from './types'
import { selfInfo } from '../common/globalVars'
import {
  FlashFileDownloadingInfo,
  FlashFileDownloadStatus,
  FlashFileSetInfo,
  FlashFileUploadingInfo,
} from '@/ntqqapi/types/flashfile'
import { logSummaryMessage } from '@/ntqqapi/log'
import { setFFMpegPath } from '@/common/utils/ffmpeg'
import { registerDispatcher } from './dispatcher'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    app: Core
  }

  interface Events {
    'nt/message-created': (input: RawMessage) => void
    'nt/offline-message-created': (input: RawMessage) => void
    'nt/message-sent': (input: RawMessage) => void
    'nt/friend-request': (input: FriendRequest) => void
    'nt/system-message-created': (input: Buffer) => void
    'nt/flash-file-uploading': (input: { fileSet: FlashFileSetInfo } & FlashFileUploadingInfo) => void
    'nt/flash-file-upload-status': (input: FlashFileSetInfo) => void
    'nt/flash-file-download-status': (input: { status: FlashFileDownloadStatus, info: FlashFileSetInfo }) => void
    'nt/flash-file-downloading': (input: [fileSetId: string, info: FlashFileDownloadingInfo]) => void
    'nt/kicked-offLine': (input: KickedOffLineInfo) => void

    // Raw QQ protocol push: { cmd, payload } from PMHQ recv or direct push
    'qq/raw': (input: { cmd: string, payload: Buffer }) => void

    // Raw events parsed from QQ protocol push
    'nt/raw/self-status': (input: { status: number }) => void
    'nt/raw/new-msg': (input: RawMessage[]) => void
    'nt/raw/update-msg': (input: RawMessage[]) => void
    'nt/raw/self-send-msg': (input: RawMessage) => void
    'nt/raw/friend-request': (input: FriendRequestNotify) => void
    'nt/raw/sys-msg': (input: Buffer) => void
    'nt/raw/kicked-offline': (input: KickedOffLineInfo) => void
    'nt/raw/flash-file-download-status': (input: [status: number, errCodeOrFileSetId: number | string, fileSetIdOrInfo: string | unknown]) => void
    'nt/raw/flash-file-upload-status': (input: FlashFileSetInfo) => void
    'nt/raw/flash-file-downloading': (input: [fileSetId: string, info: FlashFileDownloadingInfo]) => void
    'nt/raw/flash-file-uploading': (input: { fileSet: FlashFileSetInfo } & FlashFileUploadingInfo) => void
    // Group events
    'nt/raw/group-mute': (input: { groupCode: string, operatorUid: string, targetUid: string, duration: number }) => void
    'nt/raw/group-mute-all': (input: { groupCode: string, operatorUid: string, isMute: boolean }) => void
    'nt/raw/group-essence-change': (input: { groupCode: string, msgSequence: number, operatorUin: string, isAdd: boolean }) => void
    'nt/raw/group-reaction': (input: { groupCode: string, msgSeq: number, operatorUid: string, code: string, isAdd: boolean, count: number }) => void
    'nt/raw/group-poke': (input: { groupCode: string, fromUin: string, toUin: string, action: string, suffix: string, actionImg: string, msgUid?: string }) => void
    'nt/raw/group-title-changed': (input: { groupCode: string, memberUin: string, title: string }) => void
    'nt/raw/group-name-changed': (input: { groupCode: string, newName: string, operatorUid: string }) => void
    // Friend events
    'nt/raw/friend-poke': (input: { fromUin: string, toUin: string, action: string, suffix: string, actionImg: string, msgUid?: string }) => void
    'nt/raw/friend-pin-changed': (input: { uid: string, isPinned: boolean }) => void
    'nt/raw/friend-added': (input: { peerUin: string, peerUid: string }) => void
    /** 群/私聊语音转写文字结果异步推送（pttTrans.TransGroupPttReq/TransC2CPttReq 提交后由这条 event 喂结果） */
    'nt/raw/ptt-trans-result': (input: { msgUid: string, chatType: ChatType, peerUin: string, senderUin: string, text: string }) => void

    'nt/message-deleted': (input: MessageDeleteEvent) => void
    'nt/group-join-request': (input: GroupJoinRequestEvent) => void
    'nt/group-invited-join-request': (input: GroupInvitedJoinRequestEvent) => void
    'nt/group-invitation': (input: GroupInvitationEvent) => void
    'nt/group-added': (input: GroupAddedEvent) => void
    'nt/group-removed': (input: GroupRemovedEvent) => void
    'nt/group-disband': (input: GroupDisbandEvent) => void
    'nt/group-member-added': (input: GroupMemberAddedEvent) => void
    'nt/group-member-removed': (input: GroupMemberRemovedEvent) => void
    'nt/group-member-card-name-changed': (input: GroupMemberCardNameChangedEvent) => void
  }
}

class Core extends Service {
  static inject = [
    'ntMsgApi', 'ntFriendApi', 'store',
    'ntFileApi', 'qqProtocol', 'ntGroupApi',
    'ntUserApi'
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
    if (!sendElements.length) {
      throw new Error('消息体无法解析，请检查是否发送了不支持的消息类型')
    }
    const returnMsg = await ctx.ntMsgApi.sendMsg(peer, sendElements)
    this.messageSentCount++
    deleteAfterSentFiles.forEach(path => {
      unlink(path).catch(noop)
    })
    return returnMsg
  }

  private async handleMessage(msgList: RawMessage[]) {
    for (const message of msgList) {
      const msgTime = +message.msgTime
      if (msgTime < this.startupTime) {
        this.ctx.parallel('nt/offline-message-created', message)
        continue
      }
      if (message.senderUin && message.senderUin !== 0) {
        this.ctx.store.addMsgCache(message)
      }
      this.lastMessageTime = msgTime
      this.messageReceivedCount++
      logSummaryMessage(this.ctx, message).then()
      this.ctx.parallel('nt/message-created', message)
    }
  }

  private registerListener() {
    this.ctx.on('nt/raw/self-status', (info) => {
      Object.assign(selfInfo, { online: info.status !== 20 })
    })

    this.ctx.on('nt/raw/new-msg', payload => {
      this.handleMessage(payload)
    })

    const friendRequestSeen: string[] = []
    this.ctx.on('nt/raw/friend-request', payload => {
      for (const req of payload.buddyReqs) {
        if (!req.isUnread || req.isInitiator || (req.isDecide && req.reqType !== BuddyReqType.MeInitiatorWaitPeerConfirm)) {
          continue
        }
        if (+req.reqTime < this.startupTime) {
          continue
        }
        // 去重：同一 friend 在 30s 内的多次 request 推送当成同一事件
        // (服务器有时会通过 0x210 + InfoSync 双推同一申请)
        const dedupeKey = `${req.friendUid}|${req.reqTime}`
        if (friendRequestSeen.includes(dedupeKey)) {
          continue
        }
        friendRequestSeen.push(dedupeKey)
        if (friendRequestSeen.length > 200) {
          friendRequestSeen.shift()
        }
        this.ctx.parallel('nt/friend-request', req)
      }
    })

    this.ctx.on('nt/raw/sys-msg', payload => {
      this.ctx.parallel('nt/system-message-created', payload)
    })

    this.ctx.on('nt/raw/flash-file-download-status', payload => {
      // 旧版本 QQ 会把 fileSetId 放在第 2 个参数
      // 新版本 QQ 会把 fileSetId 放在第 3 个参数
      const [status, errCodeOrFileSetId, fileSetIdOrFileInfo] = payload
      let fileSetId: string;
      if (typeof fileSetIdOrFileInfo !== 'string') {
        fileSetId = errCodeOrFileSetId as string
      }
      else {
        fileSetId = fileSetIdOrFileInfo as string
      }
      this.ctx.ntFileApi.getFlashFileInfo(fileSetId).then(info => {
        this.ctx.parallel('nt/flash-file-download-status', {
          status,
          info
        })
      }).catch(err => {
        this.ctx.logger.error(err, { fileSetId })
      })
    })

    this.ctx.on('nt/raw/flash-file-upload-status', payload => {
      this.ctx.parallel('nt/flash-file-upload-status', payload)
    })

    this.ctx.on('nt/raw/flash-file-downloading', payload => {
      const [fileSetId, info] = payload
      this.ctx.parallel('nt/flash-file-downloading', [fileSetId, info])
    })

    this.ctx.on('nt/raw/flash-file-uploading', payload => {
      this.ctx.parallel('nt/flash-file-uploading', payload)
    })

    this.ctx.on('nt/raw/kicked-offline', info => {
      this.ctx.parallel('nt/kicked-offLine', info)
    })
  }
}

namespace Core {
  export interface Config extends LLOBConfig {
  }
}

export default Core
