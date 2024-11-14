import * as NT from '@/ntqqapi/types'
import { omit } from 'cosmokit'
import { Event } from '@satorijs/protocol'
import { Service, Context } from 'cordis'
import { SatoriConfig } from '@/common/types'
import { SatoriServer } from './server'
import { selfInfo } from '@/common/globalVars'
import { ObjectToSnake } from 'ts-case-convert'
import { isDeepStrictEqual } from 'node:util'
import { parseMessageCreated, parseMessageDeleted } from './event/message'
import { parseGuildAdded, parseGuildRemoved, parseGuildRequest } from './event/guild'
import { parseGuildMemberAdded, parseGuildMemberRemoved, parseGuildMemberRequest } from './event/member'
import { parseFriendRequest } from './event/user'

declare module 'cordis' {
  interface Context {
    satori: SatoriAdapter
  }
}

class SatoriAdapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFileCacheApi',
    'ntFriendApi', 'ntGroupApi', 'ntUserApi',
    'ntWindowApi', 'ntWebApi', 'store',
  ]
  private counter: number
  private selfId: string
  private server: SatoriServer

  constructor(public ctx: Context, public config: SatoriAdapter.Config) {
    super(ctx, 'satori', true)
    this.counter = 0
    this.selfId = selfInfo.uin
    this.server = new SatoriServer(ctx, config)
  }

  async handleMessage(input: NT.RawMessage) {
    if (
      input.msgType === 5 &&
      input.subMsgType === 8 &&
      input.elements[0]?.grayTipElement?.groupElement?.type === 1 &&
      input.elements[0].grayTipElement.groupElement.memberUid === selfInfo.uid
    ) {
      // 自身主动申请
      return await parseGuildAdded(this, input)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 12 &&
      input.elements[0]?.grayTipElement?.xmlElement?.templId === '10179' &&
      input.elements[0].grayTipElement.xmlElement.templParam.get('invitee') === selfInfo.uin
    ) {
      // 自身被邀请
      return await parseGuildAdded(this, input)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 8 &&
      input.elements[0]?.grayTipElement?.groupElement?.type === 3
    ) {
      // 自身被踢出
      return await parseGuildRemoved(this, input)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 8 &&
      input.elements[0]?.grayTipElement?.groupElement?.type === 1
    ) {
      // 他人主动申请
      return await parseGuildMemberAdded(this, input)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 12 &&
      input.elements[0]?.grayTipElement?.xmlElement?.templId === '10179'
    ) {
      // 他人被邀请
      return await parseGuildMemberAdded(this, input)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 12 &&
      input.elements[0]?.grayTipElement?.jsonGrayTipElement?.busiId === '19217'
    ) {
      // 机器人被邀请
      return await parseGuildMemberAdded(this, input, true)
    }
    else if (
      input.msgType === 5 &&
      input.subMsgType === 12 &&
      input.elements[0]?.grayTipElement?.xmlElement?.templId === '10382'
    ) {
      // 机器人被表情回应
    }
    else {
      // 普通的消息
      return await parseMessageCreated(this, input)
    }
  }

  async handleGroupNotify(input: NT.GroupNotify, doubt: boolean) {
    if (
      input.type === NT.GroupNotifyType.InvitedByMember &&
      input.status === NT.GroupNotifyStatus.Unhandle
    ) {
      // 自身被邀请，需自身同意
      return await parseGuildRequest(this, input)
    }
    else if (
      input.type === NT.GroupNotifyType.MemberLeaveNotifyAdmin ||
      input.type === NT.GroupNotifyType.KickMemberNotifyAdmin
    ) {
      // 他人主动退出或被踢
      return await parseGuildMemberRemoved(this, input)
    }
    else if (
      input.type === NT.GroupNotifyType.RequestJoinNeedAdminiStratorPass &&
      input.status === NT.GroupNotifyStatus.Unhandle
    ) {
      // 他人主动申请，需管理员同意
      return await parseGuildMemberRequest(this, input, doubt)
    }
    else if (
      input.type === NT.GroupNotifyType.InvitedNeedAdminiStratorPass &&
      input.status === NT.GroupNotifyStatus.Unhandle
    ) {
      // 他人被邀请，需管理员同意
      return await parseGuildMemberRequest(this, input, doubt)
    }
  }

  start() {
    this.server.start()

    this.ctx.on('nt/message-created', async input => {
      const event = await this.handleMessage(input)
        .catch(e => this.ctx.logger.error(e))
      event && this.server.dispatch(event)
    })

    this.ctx.on('nt/group-notify', async input => {
      const { doubt, notify } = input
      const event = await this.handleGroupNotify(notify, doubt)
        .catch(e => this.ctx.logger.error(e))
      event && this.server.dispatch(event)
    })

    this.ctx.on('nt/message-deleted', async input => {
      const event = await parseMessageDeleted(this, input)
        .catch(e => this.ctx.logger.error(e))
      event && this.server.dispatch(event)
    })

    this.ctx.on('nt/friend-request', async input => {
      const event = await parseFriendRequest(this, input)
        .catch(e => this.ctx.logger.error(e))
      event && this.server.dispatch(event)
    })

    this.ctx.on('llob/config-updated', async input => {
      const old = omit(this.config, ['ffmpeg'])
      if (!isDeepStrictEqual(old, input.satori)) {
        await this.server.stop()
        this.server.updateConfig(input.satori)
        this.server.start()
      }
      Object.assign(this.config, {
        ...input.satori,
        ffmpeg: input.ffmpeg
      })
    })
  }

  event(type: string, data: Partial<ObjectToSnake<Event>>): ObjectToSnake<Event> {
    return {
      id: ++this.counter,
      type,
      self_id: this.selfId,
      platform: 'llonebot',
      timestamp: Date.now(),
      ...data
    }
  }
}

namespace SatoriAdapter {
  export interface Config extends SatoriConfig {
    ffmpeg?: string
  }
}

export default SatoriAdapter
