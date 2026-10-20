import { createHmac } from 'node:crypto'
import { Context, h, Schema } from '@luckylillia/plugin-sdk'

declare module '@cordisjs/plugin-database' {
  interface Tables {
    keyword_reply_hits: { pattern: string; count: number }
  }
}

export const name = 'keyword-reply'
export const inject = ['bots', 'database']

export interface Rule {
  pattern: string
  mode: 'contains' | 'full' | 'regex'
  reply: string
  probability: number
}

export interface Config {
  rules: Rule[]
  groups: string[]
  cooldown: number
  webhook: false | { url: string; secret?: string }
}

export const Config: Schema<Config> = Schema.object({
  rules: Schema.array(Schema.object({
    pattern: Schema.string().required().description('关键词'),
    mode: Schema.union([
      Schema.const('contains').description('包含'),
      Schema.const('full').description('完全匹配'),
      Schema.const('regex').description('正则'),
    ]).default('contains').description('匹配方式'),
    reply: Schema.string().role('textarea').required().description('回复内容'),
    probability: Schema.percent().default(1).description('触发概率'),
  })).role('table').default([]).description('规则'),
  groups: Schema.array(String).default([]).description('只在这些群生效，留空表示所有群和私聊'),
  cooldown: Schema.natural().role('ms').default(3000).description('同一会话两次回复的最短间隔'),
  webhook: Schema.union([
    Schema.const(false).description('关闭'),
    Schema.object({
      url: Schema.string().role('link').required().description('地址'),
      secret: Schema.string().role('secret').description('签名密钥，留空不签名'),
    }).description('开启'),
  ]).default(false).description('命中后推送到 webhook'),
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('keyword-reply')
  ctx.model.extend('keyword_reply_hits', { pattern: 'string', count: 'unsigned' }, { primary: 'pattern' })

  const matchers = config.rules.flatMap((rule) => {
    if (rule.mode !== 'regex') return [{ rule, test: (text: string) => rule.mode === 'full' ? text === rule.pattern : text.includes(rule.pattern) }]
    try {
      const regex = new RegExp(rule.pattern)
      return [{ rule, test: (text: string) => regex.test(text) }]
    } catch (e) {
      logger.warn(`skipping rule with an invalid regex ${rule.pattern}: ${(e as Error).message}`)
      return []
    }
  })
  const lastReply = new Map<string, number>()

  ctx.on('bot/message', async (session, next) => {
    if (config.groups.length && !(session.guildId && config.groups.includes(session.guildId))) return next()
    const text = session.elements.filter(element => element.type === 'text').map(element => element.attrs.content).join('').trim()
    const hit = matchers.find(matcher => matcher.test(text))
    if (!hit || Math.random() >= hit.rule.probability) return next()
    const scope = session.channelId ?? ''
    if (Date.now() - (lastReply.get(scope) ?? 0) < config.cooldown) return next()
    lastReply.set(scope, Date.now())

    await session.send(h.parse(hit.rule.reply))
    const [row] = await ctx.database.get('keyword_reply_hits', { pattern: hit.rule.pattern })
    await ctx.database.upsert('keyword_reply_hits', [{ pattern: hit.rule.pattern, count: (row?.count ?? 0) + 1 }])
    if (config.webhook) notify(config.webhook, { pattern: hit.rule.pattern, channelId: session.channelId, userId: session.userId, text })
  })

  function notify(target: { url: string; secret?: string }, payload: Record<string, unknown>) {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (target.secret) headers['x-signature'] = createHmac('sha256', target.secret).update(body).digest('hex')
    fetch(target.url, { method: 'POST', headers, body }).catch(e => logger.warn(`webhook failed: ${(e as Error).message}`))
  }
}
