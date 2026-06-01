import { Context, Service } from 'cordis'
import { OB11Entities } from './entities'
import {
  ChatType,
  FriendRequest,
  GroupNotificationType,
  RawMessage,
} from '../ntqqapi/types'
import {
  OB11GroupRequestAddEvent,
  OB11GroupRequestInviteBotEvent,
} from './event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from './event/request/OB11FriendRequest'
import { GroupDecreaseSubType, OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { selfInfo } from '../common/globalVars'
import { Config as LLOBConfig, OB11Config } from '../common/types'
import { OB11WebSocket, OB11WebSocketReverse } from './connect/ws'
import { OB11Http, OB11HttpPost } from './connect/http'
import { OB11BaseEvent } from './event/OB11BaseEvent'
import { initActionMap } from './action'
import { OB11GroupAdminNoticeEvent } from './event/notice/OB11GroupAdminNoticeEvent'
import { OB11ProfileLikeEvent } from './event/notice/OB11ProfileLikeEvent'
import { Msg, Notify } from '@/ntqqapi/proto'
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
  OB11GroupPokeEvent,
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
import { OB11GroupRecallNoticeEvent } from './event/notice/OB11GroupRecallNoticeEvent'
import { OB11FriendRecallNoticeEvent } from './event/notice/OB11FriendRecallNoticeEvent'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'

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
    this.ctx.on('nt/message-sent', input => {
      this.handleMsg(input, true, false)
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
      else if (msgType === 528 && subType === 321) {
        // 私聊撤回戳一戳，不再从这里解析，应从 nt/message-deleted 事件中解析
      }
      else if (msgType === 732 && subType === 21) {
        // 撤回群戳一戳，不再从这里解析，应从 nt/message-deleted 事件中解析
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

    this.ctx.on('nt/message-deleted', async (data) => {
      // 群撤回 push 里 GroupRecall.random 字段在新 server / refactor 后偶尔 0，shortId hash 含
      // msgRandom，会跟发送端先前算出的 shortId 不一致。先按 (peerUid, msgSeq) 找原 msg 取真
      // random，再算 shortId 才能跟发送时一致。
      let resolved = data
      if (data.chatType === ChatType.Group && data.msgRandom === 0) {
        const cached = this.ctx.store.getMsgBySeq(data.peerUid, data.msgSeq)
        if (cached) {
          resolved = { ...data, msgRandom: cached.msgRandom, msgId: cached.msgId }
        } else {
          const peer = {
            chatType: ChatType.Group,
            peerUid: data.peerUid,
            guildId: ''
          }
          const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(peer, data.msgSeq)
          resolved = { ...data, msgRandom: msgList[0].msgRandom, msgId: msgList[0].msgId }
        }
      }
      const shortId = this.ctx.store.createMsgShortId(resolved)
      let event
      if (resolved.chatType === ChatType.Group) {
        event = new OB11GroupRecallNoticeEvent(
          resolved.peerUin,
          resolved.senderUin,
          resolved.operatorUin,
          shortId
        )
      } else {
        event = new OB11FriendRecallNoticeEvent(resolved.senderUin, shortId)
      }
      this.dispatch(event)
    })

    this.ctx.on('nt/group-join-request', (data) => {
      const event = new OB11GroupRequestAddEvent(
        data.groupCode,
        data.initiatorUin,
        encodeGroupRequestFlag(data.groupCode, data.notificationSeq, GroupNotificationType.JoinRequest, data.isDoubt),
        data.comment,
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-invited-join-request', (data) => {
      const event = new OB11GroupRequestAddEvent(
        data.groupCode,
        data.targetUserUin,
        encodeGroupRequestFlag(data.groupCode, data.notificationSeq, GroupNotificationType.InvitedJoinRequest, false),
        '',
        data.initiatorUin,
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-invitation', (data) => {
      const event = new OB11GroupRequestInviteBotEvent(
        data.groupCode,
        data.initiatorUin,
        encodeGroupRequestFlag(data.groupCode, data.invitationSeq, GroupNotificationType.Invitation, false),
        ''
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-disband', (data) => {
      const event = new OB11GroupDismissEvent(
        data.groupCode,
        data.operatorUin
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-nudge', (data) => {
      const userId = data.senderUin
      const targetId = data.receiverUin
      if (!userId || !targetId) return
      const rawInfo: Record<string, unknown>[] = [
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: userId.toString() },
        { col: '1', jp: '', txt: data.displayAction, type: 'nor' },
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: targetId.toString() },
      ]
      if (data.displaySuffix) {
        rawInfo.push({ col: '1', jp: '', txt: data.displaySuffix, type: 'nor' })
      }
      if (data.displayActionImgUrl) {
        rawInfo.push({ src: data.displayActionImgUrl, type: 'img' })
      }
      const event = new OB11GroupPokeEvent(
        data.groupCode,
        userId,
        targetId,
        rawInfo
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-admin-changed', (data) => {
      const event = new OB11GroupAdminNoticeEvent(
        data.isSet ? 'set' : 'unset',
        data.groupCode,
        data.targetUin
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-message-reaction', async (data) => {
      const peer = {
        chatType: ChatType.Group,
        peerUid: data.groupCode.toString()
      }
      const cached = this.ctx.store.getMsgBySeq(peer.peerUid, data.msgSeq)
      let messageId
      if (cached) {
        messageId = this.ctx.store.createMsgShortId(cached)
      } else {
        const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(peer, data.msgSeq)
        messageId = this.ctx.store.createMsgShortId(msgList[0])
      }
      const event = new OB11GroupMsgEmojiLikeEvent(
        data.groupCode,
        data.operatorUin,
        messageId,
        [{
          emoji_id: data.faceId,
          count: data.count
        }],
        data.isAdd
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-essence-message-changed', (data) => {
      const messageId = this.ctx.store.createMsgShortId({
        msgId: data.msgId,
        msgSeq: data.msgSeq,
        msgRandom: data.msgRandom,
        peerUid: data.groupCode.toString(),
        senderUid: data.senderUid,
        chatType: ChatType.Group
      })
      const event = new GroupEssenceEvent(
        data.groupCode,
        messageId,
        data.senderUin,
        data.operatorUin,
        data.isSet ? 'add' : 'delete',
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-whole-mute', (data) => {
      const event = new GroupBanEvent(
        data.groupCode,
        0,
        data.operatorUin,
        data.isMute ? -1 : 0,
        data.isMute ? 'ban' : 'lift_ban'
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-mute', (data) => {
      const event = new GroupBanEvent(
        data.groupCode,
        data.memberUin,
        data.operatorUin,
        data.duration,
        data.duration !== 0 ? 'ban' : 'lift_ban'
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-member-added', (data) => {
      const event = new OB11GroupIncreaseEvent(
        data.groupCode,
        data.memberUin,
        data.operatorUin ?? data.invitorUin!,
        data.operatorUid ? 'approve' : 'invite'
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-member-removed', (data) => {
      let subType: GroupDecreaseSubType = 'leave'
      if (data.operatorUin) {
        if (data.memberUin === +selfInfo.uin) {
          subType = 'kick_me'
        } else {
          subType = 'kick'
        }
      }
      const event = new OB11GroupDecreaseEvent(
        data.groupCode,
        data.memberUin,
        data.operatorUin ?? data.memberUin,
        subType
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-member-card-name-changed', (data) => {
      const event = new OB11GroupCardEvent(
        data.groupCode,
        data.uin,
        data.newCardName,
        data.oldCardName
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/group-member-special-title-changed', (data) => {
      const event = new OB11GroupTitleEvent(
        data.groupCode,
        data.uin,
        data.newSpecialTitle
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/friend-request', (data) => {
      const event = new OB11FriendRequestEvent(
        data.initiatorUin,
        data.comment,
        data.initiatorUid,
        data.via
      )
      this.dispatch(event)
    })

    this.ctx.on('nt/friend-added', (data) => {
      const event = new OB11FriendAddNoticeEvent(data.uin)
      this.dispatch(event)
    })

    this.ctx.on('nt/friend-nudge', (data) => {
      const userId = data.uin
      const targetId = data.isSelfReceive ? +selfInfo.uin : data.uin
      if (!userId || !targetId) return
      const rawInfo: Record<string, unknown>[] = [
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: userId.toString() },
        { col: '1', jp: '', txt: data.displayAction, type: 'nor' },
        { col: '1', jp: '', nm: '', tp: '0', type: 'qq', uid: targetId.toString() },
      ]
      if (data.displaySuffix) {
        rawInfo.push({ col: '1', jp: '', txt: data.displaySuffix, type: 'nor' })
      }
      if (data.displayActionImgUrl) {
        rawInfo.push({ src: data.displayActionImgUrl, type: 'img' })
      }
      this.dispatch(new OB11FriendPokeEvent(userId, targetId, rawInfo))
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
