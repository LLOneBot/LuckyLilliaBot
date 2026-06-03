import * as NT from '@/ntqqapi/types'
import { noop, omit } from 'cosmokit'
import { Event, Login } from '@satorijs/protocol'
import { Service, Context } from 'cordis'
import { SatoriConfig } from '@/common/types'
import { SatoriServer } from './server'
import { decodeUser } from './utils'
import { selfInfo } from '@/common/globalVars'
import { ObjectToSnake } from 'ts-case-convert'
import { isDeepStrictEqual } from 'node:util'
import { parseMessageCreated, parseMessageDeleted } from './event/message'
import { parseGuildAdded, parseGuildRemoved, parseGuildRequest, parseGuildUpdated } from './event/guild'
import { parseGuildMemberAdded, parseGuildMemberRemoved, parseGuildMemberRequest } from './event/member'
import { parseFriendRequest } from './event/friend'
import { parseReactionAdded, parseReactionRemoved } from './event/reaction'

declare module 'cordis' {
  interface Context {
    satori: SatoriAdapter
  }
}

class SatoriAdapter extends Service {
  static inject = [
    'ntMsgApi', 'ntFileApi', 'ntFriendApi',
    'ntGroupApi', 'ntUserApi', 'ntWebApi',
    'store', 'app'
  ]
  private selfId: string
  private server: SatoriServer
  private _eventSeq: number
  public _loginSeq: number
  private listenedEvent = false

  constructor(public ctx: Context, public config: SatoriAdapter.Config) {
    super(ctx, 'satori')
    this.selfId = selfInfo.uin
    this.server = new SatoriServer(ctx, config)
    this._eventSeq = 0
    this._loginSeq = 1
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  start() {
    this.ctx.on('llob/config-updated', async input => {
      const old = omit(this.config, ['ffmpeg'])
      const inputSatoriConfig = input.satori
      if (!isDeepStrictEqual(old, inputSatoriConfig)) {
        await this.server.stop()
        this.server.updateConfig(inputSatoriConfig)
        if (inputSatoriConfig.enable) {
          this.server.start()
          this.listenEvent()
        }
      }
      Object.assign(this.config, { ...inputSatoriConfig, ffmpeg: input.ffmpeg })
    })
    if (this.config.enable) {
      this.server.start()
    } else {
      return
    }
    this.listenEvent()
  }

  listenEvent() {
    if (this.listenedEvent) return
    this.listenedEvent = true

    this.ctx.on('nt/message-created', async (data) => {
      const event = await parseMessageCreated(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/message-deleted', async (data) => {
      const event = await parseMessageDeleted(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-join-request', async (data) => {
      const type = NT.GroupNotificationType.JoinRequest
      const event = await parseGuildMemberRequest(this, data, type)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-invited-join-request', async (data) => {
      const type = NT.GroupNotificationType.InvitedJoinRequest
      const event = await parseGuildMemberRequest(this, data, type)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-invitation', async (data) => {
      const event = await parseGuildRequest(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-added', async (data) => {
      const event = await parseGuildAdded(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-removed', async (data) => {
      const event = await parseGuildRemoved(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-name-changed', async (data) => {
      const event = await parseGuildUpdated(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-message-reaction', async (data) => {
      const event = data.isAdd
        ? await parseReactionAdded(this, data).catch(e => this.ctx.logger.error(e))
        : await parseReactionRemoved(this, data).catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-member-added', async (data) => {
      const event = await parseGuildMemberAdded(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/group-member-removed', async (data) => {
      const event = await parseGuildMemberRemoved(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })

    this.ctx.on('nt/friend-request', async (data) => {
      const event = await parseFriendRequest(this, data)
        .catch(e => this.ctx.logger.error(e))
      if (event) {
        this.server.dispatch(event)
      }
    })
  }

  event(type: string, data: Partial<ObjectToSnake<Event>>): ObjectToSnake<Event> {
    const sn = ++this._eventSeq
    return {
      // @ts-expect-error: For backward compatibility
      id: sn,
      sn,
      type,
      self_id: this.selfId,
      platform: 'llonebot',
      timestamp: Date.now(),
      // https://satori.chat/zh-CN/protocol/events.html#event
      // 非登录事件中的 login 资源只会带有 sn, user 和 platform 三个属性
      login: {
        sn: this._loginSeq,
        user: decodeUser(selfInfo),
        platform: 'llonebot',
      } as Login,
      ...data,
    }
  }
}

namespace SatoriAdapter {
  export interface Config extends SatoriConfig {
    ffmpeg?: string
  }
}

export default SatoriAdapter
