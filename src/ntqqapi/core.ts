import { unlink } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { Service, Context } from 'cordis'
import { registerReceiveHook, ReceiveCmdS, registerCallHook } from './hook'
import { Config as LLOBConfig } from '../common/types'
import {
  RawMessage,
  GroupNotify,
  FriendRequestNotify,
  FriendRequest,
  GroupMember,
  BuddyReqType,
  GrayTipElementSubType,
  CategoryFriend,
  SimpleInfo,
  ChatType,
  Peer,
  SendMessageElement,
  ElementType, GroupSimpleInfo,
} from './types'
import { selfInfo } from '../common/globalVars'
import { version } from '../version'
import { pmhq } from './native/pmhq'
import {
  FlashFileDownloadingInfo,
  FlashFileDownloadStatus,
  FlashFileSetInfo,
  FlashFileUploadingInfo,
} from '@/ntqqapi/types/flashfile'
import { logSummaryMessage } from '@/ntqqapi/log'
import { setFfmpegPath } from 'fluent-ffmpeg'
import { setFFMpegPath } from '@/common/utils/ffmpeg'

declare module 'cordis' {
  interface Context {
    app: Core
  }

  interface Events {
    'nt/message-created': (input: RawMessage) => void
    'nt/message-deleted': (input: RawMessage) => void
    'nt/message-sent': (input: RawMessage) => void
    'nt/group-notify': (input: { notify: GroupNotify, doubt: boolean }) => void
    'nt/group-dismiss': (input: GroupSimpleInfo) => void
    'nt/friend-request': (input: FriendRequest) => void
    'nt/group-member-info-updated': (input: { groupCode: string, members: GroupMember[] }) => void
    'nt/system-message-created': (input: Uint8Array) => void
    'nt/flash-file-uploading': (input: {fileSet: FlashFileSetInfo} & FlashFileUploadingInfo) => void
    'nt/flash-file-upload-status': (input: FlashFileSetInfo) => void
    'nt/flash-file-download-status': (input: {status: FlashFileDownloadStatus, info: FlashFileSetInfo}) => void
    'nt/flash-file-downloading': (input: [fileSetId: string, info: FlashFileDownloadingInfo]) => void
  }
}

class Core extends Service {
  static inject = ['ntMsgApi', 'ntFriendApi', 'ntGroupApi', 'store', 'ntUserApi', 'ntFileApi']
  public startupTime = 0
  public messageReceivedCount = 0
  public messageSentCount = 0
  public lastMessageTime = 0
  public pmhq

  constructor(protected ctx: Context, public config: Core.Config) {
    super(ctx, 'app', true)
    this.pmhq = pmhq
  }

  public start() {
    this.startupTime = Math.trunc(Date.now() / 1000)
    this.registerListener()
    this.ctx.logger.info(`LLOneBot/${version}`)
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
      const info = await ctx.ntGroupApi.getGroupAllInfo(peer.peerUid)
        .catch(() => undefined)
      const shutUpMeTimestamp = info?.shutUpMeTimestamp
      if (shutUpMeTimestamp && shutUpMeTimestamp * 1000 > Date.now()) {
        throw new Error('当前处于被禁言状态')
      }
    }
    if (!sendElements.length) {
      throw new Error('消息体无法解析，请检查是否发送了不支持的消息类型')
    }
    // 计算发送的文件大小
    let totalSize = 0
    for (const fileElement of sendElements) {
      try {
        if (fileElement.elementType === ElementType.Ptt) {
          totalSize += statSync(fileElement.pttElement.filePath!).size
        }
        else if (fileElement.elementType === ElementType.File) {
          totalSize += statSync(fileElement.fileElement.filePath!).size
        }
        else if (fileElement.elementType === ElementType.Video) {
          totalSize += statSync(fileElement.videoElement.filePath).size
        }
        else if (fileElement.elementType === ElementType.Pic) {
          totalSize += statSync(fileElement.picElement.sourcePath!).size
        }
      } catch (e) {
        ctx.logger.warn('文件大小计算失败', e, fileElement)
      }
    }
    const timeout = 10000 + (totalSize / 1024 / 256 * 1000)  // 10s Basic Timeout + PredictTime( For File 512kb/s )
    const returnMsg = await ctx.ntMsgApi.sendMsg(peer, sendElements, timeout)
    if (returnMsg) {
      this.messageSentCount++
      ctx.logger.info('消息发送', peer)
      deleteAfterSentFiles.map(path => {
          unlink(path).then().catch(e=>{})
      })
      return returnMsg
    }
  }

  private handleMessage(msgList: RawMessage[]) {
    for (const message of msgList) {
      const msgTime = parseInt(message.msgTime)
      // 过滤启动之前的消息
      if (!this.config.receiveOfflineMsg && msgTime < this.startupTime) {
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
            unlink(path).then(() => this.ctx.logger.info('删除文件成功', path)).catch(e=>{})
          }
        }
      }, this.config.autoDeleteFileSecond! * 1000)
    }
  }

  private registerListener() {
    registerReceiveHook<{ status: number }>(ReceiveCmdS.SELF_STATUS, (info) => {
      Object.assign(selfInfo, { online: info.status !== 20 })
    })

    registerReceiveHook<[
      groupCode: string,
      dataSource: number,
      members: Set<GroupMember>
    ]>(ReceiveCmdS.GROUP_MEMBER_INFO_UPDATE, async (payload) => {
      const groupCode = payload[0]
      const members = Array.from(payload[2].values())
      this.ctx.parallel('nt/group-member-info-updated', { groupCode, members })
    })


    registerReceiveHook<RawMessage[]>(ReceiveCmdS.NEW_MSG, payload => {
      this.handleMessage(payload)
    })

    const sentMsgIds = new Map<string, boolean>()
    const recallMsgIds: string[] = [] // 避免重复上报

    registerReceiveHook<RawMessage[]>([ReceiveCmdS.UPDATE_MSG], payload => {
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

    registerReceiveHook<[Peer, string[]]>(ReceiveCmdS.DELETE_MSG, payload => {
      // 撤回普通消息不会经过这里
      // 撤回戳一戳会经过这里
      const [peer, msgIds] = payload;
      for (const msgId of msgIds) {
        const msg = this.ctx.store.getMsgCache(msgId)
        if (!msg) {
          this.ctx.ntMsgApi.getMsgsByMsgId(peer, [msgId]).then(r=>{
            for(const _msg of r.msgList) {
              this.ctx.parallel('nt/message-deleted', _msg)
            }
          }).catch(e=>{
            this.ctx.logger.error('获取被撤回戳一戳消息失败', e, { peer, msgId })
          })
        }
        else{
          this.ctx.parallel('nt/message-deleted', msg)
        }
      }
    })

    registerReceiveHook<RawMessage>(ReceiveCmdS.SELF_SEND_MSG, payload => {
      sentMsgIds.set(payload.msgId, true)
    })

    const groupNotifyIgnore: string[] = []
    registerReceiveHook<[
      doubt: boolean,
      oldestUnreadSeq: string,
      unreadCount: number,
    ]>(ReceiveCmdS.UNREAD_GROUP_NOTIFY, async (payload) => {
      const [doubt, oldestUnreadSeq, unreadCount] = payload
      if (unreadCount) {
        let notifies: GroupNotify[]
        try {
          notifies = await this.ctx.ntGroupApi.getSingleScreenNotifies(doubt, unreadCount)
        } catch (e) {
          return
        }
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
      }
    })

    registerReceiveHook<FriendRequestNotify>(ReceiveCmdS.FRIEND_REQUEST, payload => {
      for (const req of payload.buddyReqs) {
        if (!!req.isInitiator || (req.isDecide && req.reqType !== BuddyReqType.MeInitiatorWaitPeerConfirm)) {
          continue
        }
        if (+req.reqTime < this.startupTime) {
          continue
        }
        this.ctx.parallel('nt/friend-request', req)
      }
    })

    registerReceiveHook<number[]>('nodeIKernelMsgListener/onRecvSysMsg', payload => {
      this.ctx.parallel('nt/system-message-created', Uint8Array.from(payload))
    })

    registerReceiveHook<[status: number, errCode: number, fileSetId: string]>(ReceiveCmdS.FLASH_FILE_DOWNLOAD_STATUS, payload => {
      const [status, errCode, fileSetId] = payload
      this.ctx.ntFileApi.getFlashFileInfo(fileSetId).then(info => {
        this.ctx.parallel('nt/flash-file-download-status', {
          status,
          info
        })
      }).catch(err => {
        this.ctx.logger.error(err, { fileSetId })
      })
    })

    registerReceiveHook<FlashFileSetInfo>(ReceiveCmdS.FLASH_FILE_UPLOAD_STATUS, payload => {
      this.ctx.parallel('nt/flash-file-upload-status', payload)
    })

    registerReceiveHook<[fileSetId: string, info: FlashFileDownloadingInfo]>(ReceiveCmdS.FLASH_FILE_DOWNLOADING, payload => {
      const [fileSetId, info] = payload
      this.ctx.parallel('nt/flash-file-downloading', [fileSetId, info])
    })

    registerReceiveHook<{fileSet: FlashFileSetInfo} & FlashFileUploadingInfo>(ReceiveCmdS.FLASH_FILE_UPLOADING, payload => {
      this.ctx.parallel('nt/flash-file-uploading', payload)
    })

    registerReceiveHook<[type: number, groups: GroupSimpleInfo[]]>(ReceiveCmdS.GROUPS, async (data) => {
      const [type, groups] = data
      if (type !== 3){
        return
      }
      for (const group of groups) {
        if (!group.groupOwnerId.memberUid){
          // 群被解散
          this.ctx.parallel('nt/group-dismiss', group)
        }
      }
    })
  }
}

namespace Core {
  export interface Config extends LLOBConfig {
  }
}

export default Core
