import { Guild } from '@satorijs/protocol'
import { Handler } from '..'
import * as ntqq from '@/plugin/internal/service/ntqq-universal/api'

interface Payload {
  guild_id: string
}

export const getGuild: Handler<Guild, Payload> = (ctx, payload) => ntqq.getGuild(ctx, payload.guild_id)
