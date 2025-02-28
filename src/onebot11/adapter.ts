import { Service, Context } from 'cordis'
import { OB11Entities } from './entities'
import {
  GroupNotify,
  GroupNotifyType,
  RawMessage,
  FriendRequest,
  GroupNotifyStatus
} from '../ntqqapi/types'
import { OB11GroupRequestEvent } from './event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from './event/request/OB11FriendRequest'
import { OB11GroupDecreaseEvent } from './event/notice/OB11GroupDecreaseEvent'
import { selfInfo } from '../common/globalVars'
import { OB11Config, Config as LLOBConfig } from '../common/types'
import { OB11WebSocket, OB11WebSocketReverseManager } from './connect/ws'
import { OB11Http, OB11HttpPost } from './connect/http'
import { OB11BaseEvent } from './event/OB11BaseEvent'
import { OB11BaseMetaEvent } from './event/meta/OB11BaseMetaEvent'
import { postHttpEvent } from './helper/eventForHttp'
import { initActionMap } from './action'
import { llonebotError } from '../common/globalVars'
import { OB11GroupAdminNoticeEvent } from './event/notice/OB11GroupAdminNoticeEvent'
import { OB11ProfileLikeEvent } from './event/notice/OB11ProfileLikeEvent'
import { Msg, SysMsg } from '@/ntqqapi/proto/compiled'
import { OB11GroupIncreaseEvent } from './event/notice/OB11GroupIncreaseEvent'

declare module 'cordis' {
  interface Context {
    onebot: OneBot11Adapter
  }
}

class OneBot11Adapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFileCacheApi',
    'ntFriendApi', 'ntGroupApi', 'ntUserApi',
    'ntWebApi', 'ntSystemApi', 'store', 'app'
  ]
  private ob11WebSocket
  private ob11WebSocketReverseManager
  private ob11Http
  private ob11HttpPost

  constructor(public ctx: Context, public config: OneBot11Adapter.Config) {
    super(ctx, 'onebot', true)
    const actionMap = initActionMap(this)
    this.ob11Http = new OB11Http(ctx, {
      port: config.httpPort,
      token: config.token,
      actionMap,
      listenLocalhost: config.listenLocalhost
    })
    this.ob11HttpPost = new OB11HttpPost(ctx, {
      hosts: config.httpHosts,
      heartInterval: config.heartInterval,
      secret: config.httpSecret,
      enableHttpHeart: config.enableHttpHeart
    })
    this.ob11WebSocket = new OB11WebSocket(ctx, {
      port: config.wsPort,
      heartInterval: config.heartInterval,
      token: config.token,
      actionMap,
      listenLocalhost: config.listenLocalhost
    })
    this.ob11WebSocketReverseManager = new OB11WebSocketReverseManager(ctx, {
      hosts: config.wsHosts,
      heartInterval: config.heartInterval,
      token: config.token,
      actionMap
    })
  }

  public dispatch(event: OB11BaseEvent) {
    if (this.config.enableWs) {
      this.ob11WebSocket.emitEvent(event)
    }
    if (this.config.enableWsReverse) {
      this.ob11WebSocketReverseManager.emitEvent(event)
    }
    if (this.config.enableHttpPost) {
      this.ob11HttpPost.emitEvent(event)
    }
    if (this.config.enableHttp) {
      this.ob11Http.emitEvent(event)
    }
    if ((event as OB11BaseMetaEvent).meta_event_type !== 'heartbeat') {
      // 不上报心跳
      postHttpEvent(event)
    }
  }

  private async handleGroupNotify(notify: GroupNotify, doubt: boolean) {
    try {
      const flag = `${notify.group.groupCode}|${notify.seq}|${notify.type}|${doubt ? '1' : '0'}`
      if ([GroupNotifyType.MemberLeaveNotifyAdmin, GroupNotifyType.KickMemberNotifyAdmin].includes(notify.type)) {
        if (notify.user2.uid) {
          this.ctx.logger.info('有群成员被踢', notify.group.groupCode, notify.user1.uid, notify.user2.uid)
          const memberUin = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
          const adminUin = await this.ctx.ntUserApi.getUinByUid(notify.user2.uid)
          const event = new OB11GroupDecreaseEvent(
            parseInt(notify.group.groupCode),
            parseInt(memberUin),
            parseInt(adminUin),
            'kick',
          )
          this.dispatch(event)
        }
      }
      else if (notify.type === GroupNotifyType.RequestJoinNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
        this.ctx.logger.info('有加群请求')
        const requestUin = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
        const event = new OB11GroupRequestEvent(
          parseInt(notify.group.groupCode),
          parseInt(requestUin) || 0,
          flag,
          notify.postscript,
          'add'
        )
        this.dispatch(event)
      }
      /*else if (notify.type === GroupNotifyType.InvitedByMember && notify.status === GroupNotifyStatus.Unhandle) {
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
      }*/
      else if (notify.type === GroupNotifyType.InvitedNeedAdminiStratorPass && notify.status === GroupNotifyStatus.Unhandle) {
        this.ctx.logger.info('收到群员邀请加群通知')
        const userId = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
        const event = new OB11GroupRequestEvent(
          parseInt(notify.group.groupCode),
          parseInt(userId) || 0,
          flag,
          notify.postscript,
          'add'
        )
        this.dispatch(event)
      }
      else if ([
        GroupNotifyType.SetAdmin,
        GroupNotifyType.CancelAdminNotifyCanceled,
        GroupNotifyType.CancelAdminNotifyAdmin
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

  private handleMsg(message: RawMessage) {
    OB11Entities.message(this.ctx, message).then(msg => {
      if (!msg) {
        return
      }
      if (!this.config.debug && msg.message.length === 0) {
        return
      }
      const isSelfMsg = msg.user_id.toString() === selfInfo.uin
      if (isSelfMsg) {
        msg.target_id = parseInt(message.peerUin)
      }
      this.dispatch(msg)
    }).catch(e => this.ctx.logger.error('handling incoming messages', e))

    OB11Entities.groupEvent(this.ctx, message).then(groupEvent => {
      if (groupEvent) {
        this.dispatch(groupEvent)
      }
    }).catch(e => this.ctx.logger.error('handling incoming group events', e))

    OB11Entities.privateEvent(this.ctx, message).then(privateEvent => {
      if (privateEvent) {
        this.dispatch(privateEvent)
      }
    }).catch(e => this.ctx.logger.error('handling incoming buddy events', e))
  }

  private handleRecallMsg(message: RawMessage) {
    const peer = {
      peerUid: message.peerUid,
      chatType: message.chatType
    }
    const oriMessageId = this.ctx.store.getShortIdByMsgInfo(peer, message.msgId)
    if (!oriMessageId) {
      return
    }
    OB11Entities.recallEvent(this.ctx, message, oriMessageId).then((recallEvent) => {
      if (recallEvent) {
        this.dispatch(recallEvent)
      }
    })
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
      flag
    )
    this.dispatch(friendRequestEvent)
  }

  private async handleConfigUpdated(config: LLOBConfig) {
    const old = this.config
    this.ob11Http.updateConfig({
      port: config.ob11.httpPort,
      token: config.token,
    })
    this.ob11HttpPost.updateConfig({
      hosts: config.ob11.httpHosts,
      heartInterval: config.heartInterval,
      secret: config.ob11.httpSecret,
      enableHttpHeart: config.ob11.enableHttpHeart
    })
    this.ob11WebSocket.updateConfig({
      port: config.ob11.wsPort,
      heartInterval: config.heartInterval,
      token: config.token,
    })
    this.ob11WebSocketReverseManager.updateConfig({
      hosts: config.ob11.wsHosts,
      heartInterval: config.heartInterval,
      token: config.token,
    })
    // 判断是否启用或关闭 HTTP 服务
    if (config.ob11.enableHttp !== old.enableHttp) {
      if (!config.ob11.enableHttp) {
        await this.ob11Http.stop()
      } else {
        this.ob11Http.start()
      }
    }
    // HTTP 端口变化，重启服务
    if ((config.ob11.httpPort !== old.httpPort || config.ob11.listenLocalhost !== old.listenLocalhost) && config.ob11.enableHttp) {
      await this.ob11Http.stop()
      this.ob11Http.start()
    }
    // 判断是否启用或关闭正向 WebSocket
    if (config.ob11.enableWs !== old.enableWs) {
      if (config.ob11.enableWs) {
        this.ob11WebSocket.start()
      } else {
        await this.ob11WebSocket.stop()
      }
    }
    // 正向 WebSocket 端口变化，重启服务
    if ((config.ob11.wsPort !== old.wsPort || config.ob11.listenLocalhost !== old.listenLocalhost) && config.ob11.enableWs) {
      await this.ob11WebSocket.stop()
      this.ob11WebSocket.start()
      llonebotError.wsServerError = ''
    }
    // 判断是否启用或关闭反向ws
    if (config.ob11.enableWsReverse !== old.enableWsReverse) {
      if (config.ob11.enableWsReverse) {
        this.ob11WebSocketReverseManager.start()
      } else {
        this.ob11WebSocketReverseManager.stop()
      }
    }
    // 判断反向 WebSocket 地址有变化
    if (config.ob11.enableWsReverse) {
      if (config.ob11.wsHosts.length !== old.wsHosts.length) {
        this.ob11WebSocketReverseManager.stop()
        this.ob11WebSocketReverseManager.start()
      } else {
        for (const newHost of config.ob11.wsHosts) {
          if (!old.wsHosts.includes(newHost)) {
            this.ob11WebSocketReverseManager.stop()
            this.ob11WebSocketReverseManager.start()
            break
          }
        }
      }
    }
    if (config.ob11.enableHttpHeart !== old.enableHttpHeart) {
      this.ob11HttpPost.stop()
      this.ob11HttpPost.start()
    }
    Object.assign(this.config, {
      ...config.ob11,
      heartInterval: config.heartInterval,
      token: config.token,
      debug: config.debug,
      msgCacheExpire: config.msgCacheExpire,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url,
      ffmpeg: config.ffmpeg
    })
  }

  public start() {
    if (this.config.enableWs) {
      this.ob11WebSocket.start()
    }
    if (this.config.enableWsReverse) {
      this.ob11WebSocketReverseManager.start()
    }
    if (this.config.enableHttp) {
      this.ob11Http.start()
    }
    if (this.config.enableHttpPost) {
      this.ob11HttpPost.start()
    }
    this.ctx.on('llob/config-updated', input => {
      this.handleConfigUpdated(input)
    })
    this.ctx.on('nt/message-created', (input: RawMessage) => {
      // 其他终端自己发送的消息会进入这里
      if (input.senderUid === selfInfo.uid) {
        if (!this.config.reportSelfMessage) {
          return
        }
      }
      this.handleMsg(input)
    })
    this.ctx.on('nt/message-deleted', input => {
      this.handleRecallMsg(input)
    })
    this.ctx.on('nt/message-sent', input => {
      if (!this.config.reportSelfMessage) {
        return
      }
      this.handleMsg(input)
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
      } else if (msgType === 33) {
        const tip = SysMsg.GroupMemberChange.decode(sysMsg.body!.msgContent!)
        if (tip.type !== 130) return
        this.ctx.logger.info('群成员增加', tip)
        const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
        const operatorUin = await this.ctx.ntUserApi.getUinByUid(tip.adminUid)
        const event = new OB11GroupIncreaseEvent(tip.groupCode, +memberUin, +operatorUin)
        this.dispatch(event)
      } else if (msgType === 34) {
        const tip = SysMsg.GroupMemberChange.decode(sysMsg.body!.msgContent!)
        if (tip.type !== 130) return // adminUid: 0
        this.ctx.logger.info('群成员减少', tip)
        const memberUin = await this.ctx.ntUserApi.getUinByUid(tip.memberUid)
        const userId = Number(memberUin)
        const event = new OB11GroupDecreaseEvent(tip.groupCode, userId, userId)
        this.dispatch(event)
      }
    })
  }
}

namespace OneBot11Adapter {
  export interface Config extends OB11Config {
    heartInterval: number
    token: string
    debug: boolean
    musicSignUrl?: string
    enableLocalFile2Url: boolean
    ffmpeg?: string
  }
}

export default OneBot11Adapter
