import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import type { NeutralEvent } from '@luckylillia/plugin-sdk'
import * as NT from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { parseMessageCreated, parseMessageDeleted } from './event/message'
import { parseGuildAdded, parseGuildRemoved, parseGuildRequest, parseGuildUpdated } from './event/guild'
import { parseGuildMemberAdded, parseGuildMemberRemoved, parseGuildMemberRequest } from './event/member'
import { parseFriendRequest } from './event/friend'
import { parseReactionAdded, parseReactionRemoved } from './event/reaction'
import type { SatoriEvent } from '../../../../universal/types'
import { NTQQBot } from './bot'

export const name = 'ntqq-universal'
// The bot is the logged-in account. The rest is what the converters, MessageEncoder and api.ts reach through ctx
export const inject = ['account', 'bots', 'app', 'store', 'ntMsgApi', 'ntFileApi', 'ntFriendApi', 'ntGroupApi', 'ntUserApi', 'ntWebApi']

/** Turns the NT events into Satori sessions for plugins, alongside the protocol adapters. */
export function apply(ctx: Context) {
  const logger = ctx.logger('universal')
  const bot = new NTQQBot(ctx)
  ctx.bots.register(bot)

  // One failing converter must not take down the adapters listening to the same NT event
  const forward = (task: Promise<SatoriEvent | undefined | void>) => {
    task
      .then(event => event && ctx.bots.dispatch(bot, event as NeutralEvent))
      .catch(e => logger.error(e))
  }

  ctx.on('nt/message-created', data => forward(parseMessageCreated(bot, data)))
  ctx.on('nt/message-deleted', data => forward(parseMessageDeleted(bot, data)))
  ctx.on('nt/group-join-request', data => {
    forward(parseGuildMemberRequest(bot, data, NT.GroupNotificationType.JoinRequest))
  })
  ctx.on('nt/group-invited-join-request', data => {
    forward(parseGuildMemberRequest(bot, data, NT.GroupNotificationType.InvitedJoinRequest))
  })
  ctx.on('nt/group-invitation', data => forward(parseGuildRequest(bot, data)))
  ctx.on('nt/group-added', data => forward(parseGuildAdded(bot, data)))
  ctx.on('nt/group-removed', data => forward(parseGuildRemoved(bot, data)))
  ctx.on('nt/group-name-changed', data => forward(parseGuildUpdated(bot, data)))
  ctx.on('nt/group-message-reaction', data => {
    forward(data.isAdd ? parseReactionAdded(bot, data) : parseReactionRemoved(bot, data))
  })
  ctx.on('nt/group-member-added', data => forward(parseGuildMemberAdded(bot, data)))
  ctx.on('nt/group-member-removed', data => forward(parseGuildMemberRemoved(bot, data)))
  ctx.on('nt/friend-request', data => forward(parseFriendRequest(bot, data)))

  const setStatus = (status: Status) => {
    if (bot.status === status) return
    bot.status = status
    ctx.parallel('bot/status', bot).catch(e => logger.warn(e))
  }
  ctx.on('qq/online', () => setStatus(Status.ONLINE))
  ctx.on('protocol/disconnect', () => setStatus(Status.OFFLINE))
}
