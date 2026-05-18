import { unlink } from 'node:fs/promises'
import { Service, Context } from 'cordis'
import { ReceiveCmdS } from './hook'
import { Config as LLOBConfig } from '../common/types'
import {
  RawMessage,
  GroupNotify,
  FriendRequestNotify,
  FriendRequest,
  BuddyReqType,
  GrayTipElementSubType,
  ChatType,
  Peer,
  SendMessageElement,
  KickedOffLineInfo,
  MsgType,
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
import { OnQRCodeLoginSucceedParameter } from '@/ntqqapi/listeners/NodeIKernelLoginListener'
import { GroupDetailInfo, LocalExitGroupReason } from '@/ntqqapi/types'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    app: Core
  }

  interface Events {
    'nt/login-qrcode': (input: OnQRCodeLoginSucceedParameter) => void
    'nt/message-created': (input: RawMessage) => void
    'nt/offline-message-created': (input: RawMessage) => void
    'nt/message-deleted': (input: RawMessage) => void
    'nt/message-sent': (input: RawMessage) => void
    'nt/group-notify': (input: { notify: GroupNotify, doubt: boolean }) => void
    'nt/group-dismiss': (input: GroupDetailInfo) => void
    'nt/group-quit': (input: GroupDetailInfo) => void // 主动退群
    'nt/friend-request': (input: FriendRequest) => void
    'nt/system-message-created': (input: Buffer) => void
    'nt/flash-file-uploading': (input: { fileSet: FlashFileSetInfo } & FlashFileUploadingInfo) => void
    'nt/flash-file-upload-status': (input: FlashFileSetInfo) => void
    'nt/flash-file-download-status': (input: { status: FlashFileDownloadStatus, info: FlashFileSetInfo }) => void
    'nt/flash-file-downloading': (input: [fileSetId: string, info: FlashFileDownloadingInfo]) => void
    'nt/kicked-offLine': (input: KickedOffLineInfo) => void

    // Raw events parsed from QQ protocol push
    'nt/raw/new-msg': (input: RawMessage[]) => void
    'nt/raw/update-msg': (input: RawMessage[]) => void
    'nt/raw/self-send-msg': (input: RawMessage) => void
    'nt/raw/group-notifies-updated': (input: [doubt: boolean, notifies: GroupNotify[]]) => void
    'nt/raw/friend-request': (input: FriendRequestNotify) => void
  }
}

class Core extends Service {
  static inject = ['ntMsgApi', 'ntFriendApi', 'ntGroupApi', 'store', 'ntUserApi', 'ntFileApi', 'logger', 'qqProtocol']
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
    ctx.logger.info('消息发送', peer)
    deleteAfterSentFiles.forEach(path => {
      unlink(path).catch(noop)
    })
    return returnMsg
  }

  private async handleMessage(msgList: RawMessage[]) {
    for (const message of msgList) {
      const msgTime = +message.msgTime
      if (msgTime < this.startupTime || ('isOnlineMsg' in message && !message.isOnlineMsg && message.msgType !== MsgType.GrayTips)) {
        const existing = await this.ctx.store.checkMsgExist(message)
        if (!existing) {
          this.ctx.parallel('nt/offline-message-created', message)
        }
        continue
      }
      if (message.senderUin && message.senderUin !== '0') {
        this.ctx.store.addMsgCache(message)
      }
      this.lastMessageTime = msgTime
      this.messageReceivedCount++
      logSummaryMessage(this.ctx, message).then()
      this.ctx.parallel('nt/message-created', message)
    }

    // 自动清理新消息文件
    if (!this.config.autoDeleteFile) {
      return
    }

    // 使用一个定时器处理所有文件，而不是为每个元素创建定时器
    const allPaths: string[] = []
    for (const message of msgList) {
      for (const msgElement of message.elements) {
        const picPath = msgElement.picElement?.sourcePath
        const picThumbPath = [...(msgElement.picElement?.thumbPath ?? []).values()]
        const pttPath = msgElement.pttElement?.filePath
        const filePath = msgElement.fileElement?.filePath
        const videoPath = msgElement.videoElement?.filePath
        const videoThumbPath = [...(msgElement.videoElement?.thumbPath ?? []).values()]
        const pathList = [picPath, ...picThumbPath, pttPath, filePath, videoPath, ...videoThumbPath]
        if (msgElement.picElement) {
          pathList.push(...Object.values(msgElement.picElement.thumbPath))
        }
        allPaths.push(...pathList.filter((path): path is string => path !== undefined && path !== null))
      }
    }

    if (allPaths.length > 0) {
      setTimeout(() => {
        for (const path of allPaths) {
          if (path) {
            unlink(path).then(() => this.ctx.logger.info('删除文件成功', path)).catch(noop)
          }
        }
      }, this.config.autoDeleteFileSecond! * 1000)
    }
  }

  private registerListener() {

    this.ctx.on('nt/raw/new-msg', payload => {
      this.handleMessage(payload)
    })

    const sentMsgIds = new Map<string, boolean>()
    const recallMsgIds: string[] = [] // 避免重复上报

    this.ctx.on('nt/raw/update-msg', payload => {
      for (const msg of payload) {
        if (
          msg.recallTime !== '0' &&
          msg.msgType === 5 &&
          msg.subMsgType === 4 &&
          msg.elements[0]?.grayTipElement?.subElementType === GrayTipElementSubType.Revoke &&
          !recallMsgIds.includes(msg.msgId)
        ) {

          recallMsgIds.push(msg.msgId)
          this.ctx.parallel('nt/message-deleted', msg)
        }
        else if (sentMsgIds.get(msg.msgId)) {
          if (msg.sendStatus === 2) {
            sentMsgIds.delete(msg.msgId)
            logSummaryMessage(this.ctx, msg).then()
            this.ctx.parallel('nt/message-sent', msg)
          }
        }
      }

      if (recallMsgIds.length > 1000) {
        recallMsgIds.shift()
      }

      // 限制Map大小，防止内存泄露
      if (sentMsgIds.size > 1000) {
        const firstKey = sentMsgIds.keys().next().value
        if (firstKey) {
          sentMsgIds.delete(firstKey)
        }
      }
    })

    this.ctx.on('nt/raw/self-send-msg', payload => {
      sentMsgIds.set(payload.msgId, true)
    })

    const groupNotifyIgnore: string[] = []
    this.ctx.on('nt/raw/group-notifies-updated', async (payload) => {
      const [doubt, notifies] = payload
      for (const notify of notifies) {
        const notifyTime = Math.trunc(+notify.seq / 1000 / 1000)
        if (groupNotifyIgnore.includes(notify.seq) || notifyTime < this.startupTime) {
          continue
        }
        groupNotifyIgnore.push(notify.seq)
        if (groupNotifyIgnore.length > 1000) {
          groupNotifyIgnore.shift()
        }
        this.ctx.parallel('nt/group-notify', { notify, doubt: doubt })
      }
    })

    this.ctx.on('nt/raw/friend-request', payload => {
      this.ctx.ntFriendApi.clearBuddyReqUnreadCnt().catch(e => this.ctx.logger.error(`清除好友申请未读数失败`, e))
      for (const req of payload.buddyReqs) {
        if (!req.isUnread || req.isInitiator || (req.isDecide && req.reqType !== BuddyReqType.MeInitiatorWaitPeerConfirm)) {
          continue
        }
        if (+req.reqTime < this.startupTime) {
          continue
        }
        this.ctx.parallel('nt/friend-request', req)
      }
    })
  }
}

namespace Core {
  export interface Config extends LLOBConfig {
  }
}

export default Core
