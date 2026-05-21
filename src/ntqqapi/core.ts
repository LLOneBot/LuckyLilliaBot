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
import { registerDispatcher } from './dispatcher'
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

    // Raw QQ protocol push: { cmd, payload } from PMHQ recv or direct push
    'qq/raw': (input: { cmd: string, payload: Buffer }) => void

    // Raw events parsed from QQ protocol push
    'nt/raw/login-qr-code': (input: OnQRCodeLoginSucceedParameter) => void
    'nt/raw/self-status': (input: { status: number }) => void
    'nt/raw/new-msg': (input: RawMessage[]) => void
    'nt/raw/update-msg': (input: RawMessage[]) => void
    'nt/raw/delete-msg': (input: [Peer, string[]]) => void
    'nt/raw/self-send-msg': (input: RawMessage) => void
    'nt/raw/group-notifies-updated': (input: [doubt: boolean, notifies: GroupNotify[]]) => void
    'nt/raw/friend-request': (input: FriendRequestNotify) => void
    'nt/raw/sys-msg': (input: Buffer) => void
    'nt/raw/group-detail-update': (input: GroupDetailInfo) => void
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
    'nt/raw/group-poke': (input: { groupCode: string, fromUin: string, toUin: string, action: string, suffix: string, actionImg: string }) => void
    // Friend events
    'nt/raw/friend-poke': (input: { fromUin: string, toUin: string, action: string, suffix: string, actionImg: string }) => void
    'nt/raw/friend-pin-changed': (input: { uid: string, isPinned: boolean }) => void
    /** 群/私聊语音转写文字结果异步推送（pttTrans.TransGroupPttReq/TransC2CPttReq 提交后由这条 event 喂结果） */
    'nt/raw/ptt-trans-result': (input: { msgUid: string, chatType: ChatType, peerUin: string, senderUin: string, text: string }) => void
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

    this.ctx.on('nt/raw/login-qr-code', (data) => {
      this.ctx.parallel('nt/login-qrcode', data)
    })

    this.ctx.on('nt/raw/self-status', (info) => {
      Object.assign(selfInfo, { online: info.status !== 20 })
    })

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

    this.ctx.on('nt/raw/delete-msg', payload => {
      // 撤回普通消息不会经过这里
      // 撤回戳一戳会经过这里
      const [peer, msgIds] = payload;
      for (const msgId of msgIds) {
        const msg = this.ctx.store.getMsgCache(msgId)
        if (!msg) {
          this.ctx.ntMsgApi.getMsgsByMsgId(peer, [msgId]).then(r => {
            for (const _msg of r.msgList) {
              this.ctx.parallel('nt/message-deleted', _msg)
            }
          }).catch(e => {
            this.ctx.logger.error('获取被撤回戳一戳消息失败', e, { peer, msgId })
          })
        }
        else {
          this.ctx.parallel('nt/message-deleted', msg)
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

    const group_dismiss_codes: string[] = []  // 不知是否是 QQ 的 bug，退群的时候会上报一个以前解散的群，这里用于避免重复上报
    this.ctx.on('nt/raw/group-detail-update', async data => {
      if (data.localExitGroupReason === LocalExitGroupReason.DISMISS
        && !group_dismiss_codes.includes(data.groupCode)
        && data.cmdUinJoinTime > this.startupTime
      ) {
        group_dismiss_codes.push(data.groupCode)
        if (group_dismiss_codes.length > 1000) {
          group_dismiss_codes.shift()
        }
        this.ctx.parallel('nt/group-dismiss', data)
      }
      else if (data.localExitGroupReason === LocalExitGroupReason.SELF_QUIT) {
        this.ctx.parallel('nt/group-quit', data)
      }
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
