import { Context } from 'cordis'
import type { NeutralEvent } from '@luckylillia/plugin-sdk'
import type { QQOfficialConfig } from '@/common/types'
import type { SatoriEvent } from '../../../../universal/types'
import { CredentialError, QQOfficialApi } from './api'
import { Audits, QQOfficialBot } from './bot'
import { isGuildId } from './guildIds'
import { decodeDispatch, GROUP_EVENTS, isGuildInteraction } from './decode'
import { Gateway } from './gateway'
import { logMessage } from './log'
import { QQOfficialStatsTracker } from './stats'
import { mountQQOfficialStatsRoutes } from './statsRoutes'
import { GatewayPayload, GUILD_INTENTS, Intents } from './types'
import { UserNames } from './users'

export { Config } from './config'
export { QQOfficialBot } from './bot'

export const name = 'qq-official'
// Needs no QQ login: it runs alongside the scanned account, or without one
export const inject = ['bots', 'timer']

/**
 * One QQ open platform bot per AppID, across groups, C2C and guilds.
 */
export async function apply(ctx: Context, config: QQOfficialConfig) {
  const logger = ctx.logger('qq-official')
  const stats = new QQOfficialStatsTracker(config)
  let identity: QQOfficialBot | undefined
  mountQQOfficialStatsRoutes(ctx, () => stats.snapshot(identity))
  // Waits for its settings instead of failing: the card says what is missing, saving them starts it
  if (!config.appId.trim() || !config.secret) {
    logger.info('还没有填写 AppID 和 AppSecret，在设置页填好保存后连接')
    return
  }
  const api = new QQOfficialApi(ctx, {
    appId: config.appId,
    secret: config.secret,
    sandbox: config.sandbox,
    endpoint: config.endpoint,
    debug: config.debug,
  })
  try {
    await api.accessToken()
  } catch (e) {
    // Wrong credentials fail the entry, so its card says why; anything else the gateway keeps retrying
    if (e instanceof CredentialError) throw e
    logger.warn('%s', (e as Error).message)
  }

  const names = new UserNames(ctx, {
    appId: config.appId,
    persist: !config.disableUserNamePersist,
    lookupApi: config.userInfoApi,
  })
  await names.load()
  const audits = new Audits(ctx)
  const bot = new QQOfficialBot(ctx, api, config, names, audits, stats)
  identity = bot
  ctx.bots.register(bot)
  const guildEvents = config.intents.some(intent => GUILD_INTENTS.includes(intent))

  // A private bot that gets every guild message gets each @ message a second time
  const skipAtMessages = config.type === 'private' && config.intents.includes('GUILD_MESSAGES')

  const handle = async (payload: GatewayPayload) => {
    const type = payload.t!
    await ctx.bots.dispatch(bot, bot.event('internal', {
      _type: 'qq/' + type.toLowerCase().replace(/_/g, '-'),
      _data: payload.d,
    } as Partial<SatoriEvent>) as NeutralEvent)
    if (type === 'MESSAGE_AUDIT_PASS' || type === 'MESSAGE_AUDIT_REJECT') {
      return audits.settle(type === 'MESSAGE_AUDIT_PASS', payload.d)
    }
    // The button stays in a loading state until acknowledged
    if (type === 'INTERACTION_CREATE' && payload.d?.id && !config.manualAcknowledge) {
      bot.internal.acknowledgeInteraction(payload.d.id, { code: 0 })
        .catch((e: Error) => logger.warn('回应按钮交互失败: %s', e.message))
    }
    let event: SatoriEvent | undefined
    if (GROUP_EVENTS.has(type) || (type === 'INTERACTION_CREATE' && !isGuildInteraction(payload))) {
      event = decodeDispatch(bot, payload)
    } else {
      if (!guildEvents) return
      event = bot.decodeGuild(payload, { skipAtMessages })
    }
    if (!event) return
    await nameUser(event)
    if (event.type === 'message-created' && event.channel?.id && event.user?.id !== bot.selfId) {
      stats.received()
      logMessage(ctx, '收', event.channel.id, event.message?.content ?? '', event.user)
    }
    await ctx.bots.dispatch(bot, event as NeutralEvent)
  }

  // Most events name nobody: what was seen before, else the lookup service when one is set
  const nameUser = async (event: SatoriEvent) => {
    const user = event.user as { id?: string; name?: string; avatar?: string } | undefined
    if (!user?.id || user.name || isGuildId(user.id) || !config.userInfoApi) return
    const info = await names.lookup(user.id)
    if (!info?.name) return
    user.name = info.name
    if (info.avatar) user.avatar = info.avatar
    names.set(bot.platform, user.id, info.name)
    if (event.member && !event.member.nick) event.member.nick = info.name
  }

  const intents = config.intents.reduce((bits, intent) => bits | (Intents[intent] ?? 0), 0)
  const gateway = new Gateway(ctx, api, intents, {
    ready(data) {
      if (data.user?.username) bot.user.name = data.user.username
      if (data.user?.id) bot.setGuildUserId(data.user.id)
      logger.info('QQ 官方机器人已上线: %s (%s)', data.user?.username ?? '', config.appId)
      bot.initialize().catch(e => logger.warn(e))
    },
    status: status => bot.setStatus(status),
    dispatch(payload) {
      if (!config.debug) logger.debug('收到事件 %s', payload.t)
      handle(payload).catch(e => logger.warn('处理事件 %s 失败: %s', payload.t, (e as Error).message))
    },
  }, undefined, { url: config.gatewayUrl, debug: config.debug })

  ctx.effect(() => {
    gateway.start()
    return () => {
      gateway.stop()
      bot.menu.dispose()
      api.dispose()
      void names.dispose()
    }
  })
}
