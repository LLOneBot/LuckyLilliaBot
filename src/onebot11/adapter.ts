import { Context, Service } from 'cordis'
import { OB11Entities } from './entities'
import {
  ChatType,
  FriendRequest,
  GroupNotify,
  GroupNotifyStatus,
  GroupNotifyType,
  JsonGrayTipBusId,
  Peer,
  RawMessage,
} from '../ntqqapi/types'
import { OB11GroupRequestEvent } from './event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from './event/request/OB11FriendRequest'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { selfInfo } from '../common/globalVars'
import { Config as LLOBConfig, OB11Config } from '../common/types'
import { OB11WebSocket, OB11WebSocketReverse } from './connect/ws'
import { OB11Http, OB11HttpPost } from './connect/http'
import { OB11BaseEvent } from './event/OB11BaseEvent'
import { OB11BaseMetaEvent } from './event/meta/OB11BaseMetaEvent'
import { postHttpEvent } from './helper/eventForHttp'
import { initActionMap } from './action'
import { OB11GroupAdminNoticeEvent } from './event/notice/OB11GroupAdminNoticeEvent'
import { OB11ProfileLikeEvent } from './event/notice/OB11ProfileLikeEvent'
import { Msg, SysMsg } from '@/ntqqapi/proto/compiled'
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
  OB11FriendPokeRecallEvent,
  OB11GroupPokeRecallEvent,
} from '@/onebot11/event/notice/OB11PokeEvent'
import { OB11GroupDismissEvent } from '@/onebot11/event/notice/OB11GroupDismissEvent'
import { BaseAction } from './action/BaseAction'
import { cloneObj } from '@/common/utils'

declare module 'cordis' {
  interface Context {
    onebot: OneBot11Adapter
  }
}

class OneBot11Adapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFileCacheApi',
    'ntFriendApi', 'ntGroupApi', 'ntUserApi',
    'ntWebApi', 'ntSystemApi', 'store', 'app',
  ]
  private connect: (OB11Http | OB11HttpPost | OB11WebSocket | OB11WebSocketReverse)[]
  private actionMap: Map<string, BaseAction<unknown, unknown>>

  constructor(public ctx: Context, public config: OneBot11Adapter.Config) {
    super(ctx, 'onebot', true)
    this.actionMap = initActionMap(this)
    this.connect = config.connect.map(item => {
      if (item.type === 'http') {
        return new OB11Http(ctx, {
          ...item,
          actionMap: this.actionMap,
          onlyLocalhost: config.onlyLocalhost
        })
      } else if (item.type === 'http-post') {
        return new OB11HttpPost(ctx, item)
      } else if (item.type === 'ws') {
        return new OB11WebSocket(ctx, {
          ...item,
          actionMap: this.actionMap,
          onlyLocalhost: config.onlyLocalhost
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

  public dispatch(event: OB11BaseEvent) {
    for (const item of this.connect) {
      item.emitEvent(event)
    }
    if ((event as OB11BaseMetaEvent).meta_event_type !== 'heartbeat') {
      // 不上报心跳
      postHttpEvent(event)
    }
  }

  public dispatchMessageLike(event: OB11BaseEvent, self: boolean, offline: boolean) {
    for (const item of this.connect) {
      // 这里不 copy 出来的话，更改了 msg.message 会影响下一个 connect
      item.emitMessageLikeEvent(cloneObj(event) as OB11BaseEvent, self, offline)
    }
  }

  private async handleGroupNotify(notify: GroupNotify, doubt: boolean) {
    try {
      const flag = `${notify.group.groupCode}|${notify.seq}|${notify.type}|${doubt ? '1' : '0'}`
      if (notify.type === GroupNotifyType.RequestJoinNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
        this.ctx.logger.info('有加群请求')
        const requestUin = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
        const event = new OB11GroupRequestEvent(
          parseInt(notify.group.groupCode),
          parseInt(requestUin) || 0,
          flag,
          notify.postscript,
          'add',
        )
        this.dispatch(event)
      }
      else if (notify.type === GroupNotifyType.InvitedByMember && notify.status === GroupNotifyStatus.Unhandle) {
        this.ctx.logger.info('收到邀请我加群通知')
        const userId = await this.ctx.ntUserApi.getUinByUid(notify.user2.uid)
        const event = new OB11GroupRequestEvent(
          parseInt(notify.group.groupCode),
          parseInt(userId) || 0,
          flag,
          notify.postscript,
          'invite'
        )
        this.dispatch(event)
      }
      else if (notify.type === GroupNotifyType.InvitedNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
        this.ctx.logger.info('收到群员邀请加群通知')
        const userId = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
        const invitorId = await this.ctx.ntUserApi.getUinByUid(notify.user2.uid)
        const event = new OB11GroupRequestEvent(
          parseInt(notify.group.groupCode),
          parseInt(userId) || 0,
          flag,
          notify.postscript,
          'add',
          parseInt(invitorId) || 0,
        )
        this.dispatch(event)
      }
      else if ([
        GroupNotifyType.SetAdmin,
        GroupNotifyType.CancelAdminNotifyCanceled,
        GroupNotifyType.CancelAdminNotifyAdmin,
      ].includes(notify.type)) {
        this.ctx.logger.info('收到管理员变动通知')
        const uin = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
        const event = new OB11GroupAdminNoticeEvent(
          notify.type === GroupNotifyType.SetAdmin ? 'set' : 'unset',
          parseInt(notify.group.groupCode),
          parseInt(uin),
        )
        this.dispatch(event)
      }
    } catch (e) {
      this.ctx.logger.error('解析群通知失败', (e as Error).stack)
    }
  }

  private handleMsg(message: RawMessage, self: boolean, offline: boolean) {
    OB11Entities.message(this.ctx, message).then(msg => {
      if (!msg) {
        return
      }
      const isSelfMsg = msg.user_id.toString() === selfInfo.uin
      if (isSelfMsg) {
        msg.target_id = parseInt(message.peerUin)
      }
      this.dispatchMessageLike(msg, self, offline)
    }).catch(e => this.ctx.logger.error('handling incoming messages', e))

    OB11Entities.groupEvent(this.ctx, message).then(groupEvent => {
      if (groupEvent) {
        this.dispatchMessageLike(groupEvent, self, offline)
      }
    }).catch(e => this.ctx.logger.error('handling incoming group events', e))

    OB11Entities.privateEvent(this.ctx, message).then(privateEvent => {
      if (privateEvent) {
        this.dispatchMessageLike(privateEvent, self, offline)
      }
    }).catch(e => this.ctx.logger.error('handling incoming buddy events', e))
  }

  private handleRecallMsg(message: RawMessage) {
    const peer: Peer = {
      peerUid: message.peerUid,
      chatType: message.chatType,
      guildId: ''
    }
    // 解析撤回戳一戳
    const grayTipElement = message.elements.find(el => el.grayTipElement)?.grayTipElement
    if (grayTipElement && grayTipElement.jsonGrayTipElement?.busiId == JsonGrayTipBusId.Poke) {
      const json = JSON.parse(grayTipElement.jsonGrayTipElement.jsonStr)
      const templateParams = grayTipElement.jsonGrayTipElement?.xmlToJsonParam?.templParam
      const fromUserUin = templateParams?.get('uin_str1') || '0'
      const toUserUin = templateParams?.get('uin_str2') || '0'
      let recallEvent: OB11FriendPokeRecallEvent | OB11GroupPokeRecallEvent;
      if (peer.chatType === ChatType.Group) {
        recallEvent = new OB11GroupPokeRecallEvent(parseInt(message.peerUid), parseInt(fromUserUin), parseInt(toUserUin), json)
      }
      else {
        recallEvent = new OB11FriendPokeRecallEvent(parseInt(fromUserUin), parseInt(toUserUin), json)
      }
      return this.dispatch(recallEvent)
    }
    // OB11Entities.privateEvent(this.ctx, message).then(privateEvent => {
    //   if (privateEvent?.sub_type === 'poke') {
    //     (privateEvent as OB11FriendPokeEvent).sub_type = 'poke_recall'
    //     this.dispatch(privateEvent)
    //   }
    // })
    const shortId = this.ctx.store.createMsgShortId(peer, message.msgId)

    OB11Entities.recallEvent(this.ctx, message, shortId).then((recallEvent) => {
      if (recallEvent) {
        this.dispatch(recallEvent)
      }
    }).catch(e => this.ctx.logger.error('handling recall events', e))
  }

  private async handleFriendRequest(req: FriendRequest) {
    let userId = 0
    try {
      const requesterUin = await this.ctx.ntUserApi.getUinByUid(req.friendUid)
      userId = parseInt(requesterUin)
    } catch (e) {
      this.ctx.logger.error('获取加好友者QQ号失败', e)
    }
    const flag = req.friendUid + '|' + req.reqTime
    const comment = req.extWords
    const friendRequestEvent = new OB11FriendRequestEvent(
      userId,
      comment,
      flag,
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
      this.connect = config.ob11.connect.map(item => {
        if (item.type === 'http') {
          return new OB11Http(this.ctx, {
            ...item,
            actionMap: this.actionMap,
            onlyLocalhost: config.onlyLocalhost
          })
        } else if (item.type === 'http-post') {
          return new OB11HttpPost(this.ctx, item)
        } else if (item.type === 'ws') {
          return new OB11WebSocket(this.ctx, {
            ...item,
            actionMap: this.actionMap,
            onlyLocalhost: config.onlyLocalhost
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
      this.handleConfigUpdated(input).catch(e => {
      })
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
      this.handleMsg(input, false, true)
    })
    this.ctx.on('nt/message-deleted', input => {
      this.handleRecallMsg(input)
    })
    this.ctx.on('nt/message-sent', input => {
      this.handleMsg(input, true, false)
    })
    this.ctx.on('nt/group-notify', input => {
      const { doubt, notify } = input
      this.handleGroupNotify(notify, doubt)
    })
    this.ctx.on('nt/friend-request', input => {
      this.handleFriendRequest(input)
    })
    this.ctx.on('nt/system-message-created', async input => {
      const sysMsg = Msg.Message.decode(input)
      const { msgType, subType } = sysMsg.contentHead ?? {}
      if (msgType === 528 && subType === 39) {
        const tip = SysMsg.ProfileLikeTip.decode(sysMsg.body!.msgContent!)
        if (tip.msgType !== 0 || tip.subType !== 203) return
        const detail = tip.content?.msg?.detail
        if (!detail) return
        const [times] = detail.txt?.match(/\d+/) ?? ['0']
        const event = new OB11ProfileLikeEvent(detail.uin!, detail.nickname!, +times)
        this.dispatch(event)
      }
      else if (msgType === 33) {
        const tip = SysMsg.GroupMemberChange.decode(sysMsg.body!.msgContent!)
        if (tip.type !== 130) return
        this.ctx.logger.info('群成员增加', tip)
        const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
        const operatorUin = await this.ctx.ntUserApi.getUinByUid(tip.adminUid)
        const event = new OB11GroupIncreaseEvent(tip.groupCode, +memberUin, +operatorUin)
        this.dispatch(event)
      }
      else if (msgType === 34) {
        const tip = SysMsg.GroupMemberChange.decode(sysMsg.body!.msgContent!)
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
          const adminUidMatch = tip.adminUid.match(/\x18([^\x18\x10]+)\x10/)
          let adminUin = '0'
          if (adminUidMatch){
            adminUin = await this.ctx.ntUserApi.getUinByUid(adminUidMatch[1])
          }
          const event = new OB11GroupDecreaseEvent(tip.groupCode, +memberUin, +adminUin, 'kick')
          this.dispatch(event)
        }
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
                size: parseInt(file2.filePhysicalSize),
                path: file2.saveFilePath,
              })
            }
          }
          const event = new OB11FlashFileDownloadedEvent(
            input.info.name,
            input.info.shareInfo.shareLink,
            input.info.fileSetId,
            files,
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
                size: parseInt(file2.filePhysicalSize),
                path: file2.saveFilePath,
              })
            }
          }
          const event = new OB11FlashFileDownloadingEvent(
            res.name,
            res.shareInfo.shareLink,
            fileSetId,
            parseInt(downloadingInfo.curDownLoadedBytes),
            parseInt(downloadingInfo.totalDownLoadedBytes),
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
              size: parseInt(file2.filePhysicalSize),
              path: file2.physical.localPath,
            })
          }
        }

        const event = new OB11FlashFileUploadingEvent(
          info.fileSet.name,
          info.fileSet.shareInfo.shareLink,
          info.fileSet.fileSetId,
          parseInt(info.uploadedFileSize),
          parseInt(info.fileSet.totalFileSize),
          parseInt(info.uploadSpeed),
          parseInt(info.timeRemain),
          files,
        )
        this.dispatch(event)
      })

    })

    this.ctx.on('nt/group-dismiss', async (group) => {
      const groupInfo = await this.ctx.ntGroupApi.getGroupAllInfo(group.groupCode)
      const ownerUin = await this.ctx.ntUserApi.getUinByUid(groupInfo.ownerUid)
      const event = new OB11GroupDismissEvent(
        parseInt(group.groupCode),
        parseInt(ownerUin)
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
  }
}

namespace OneBot11Adapter {
  export interface Config extends OB11Config {
    onlyLocalhost: boolean
    musicSignUrl?: string
    enableLocalFile2Url: boolean
    ffmpeg?: string
  }
}

export default OneBot11Adapter
