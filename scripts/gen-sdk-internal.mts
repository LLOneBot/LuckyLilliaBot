// Writes packages/plugin-sdk/src/internal.ts: the names of every bot.internal method, from the code that makes them.
// `--check` only says whether the file is current. Run: npx tsx --tsconfig tsconfig.json scripts/gen-sdk-internal.mts
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initActionMap } from '@/plugin/internal/adapter/onebot11/action'
import { CONNECTION_ONLY, internalName } from '@/plugin/internal/service/ntqq-universal/internal'
import { guildInternal, officialInternal } from '@/plugin/internal/protocol/qq-official/internal'

export const SDK_INTERNAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/plugin-sdk/src/internal.ts')

/** The QQ account's methods with the OneBot action each runs, and the official bot's method names. */
export function internalNames() {
  const account: [string, string][] = []
  for (const [action] of initActionMap({ ctx: {} } as never)) {
    if (action.endsWith('_async') || action.endsWith('_rate_limited') || CONNECTION_ONLY.includes(action)) continue
    account.push([internalName(action), action])
  }
  const api = {} as never
  return {
    // Code-point order: the same file on every machine
    account: account.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    qq: Object.keys(officialInternal(api)).sort(),
    legacyGuild: Object.keys(guildInternal(api)).sort(),
  }
}

export function renderInternal(names = internalNames()): string {
  const methods = (list: string[]) => list.map(name => `  ${name}: Call`).join('\n')
  return `// Written by scripts/gen-sdk-internal.mts from the code that makes these methods; do not edit by hand.
import type { Bot } from './universal.js'

type Call = (...args: any[]) => Promise<any>

/**
 * \`bot.internal\` of the QQ account (\`luckylillia\`): OneBot 11's actions with the go-cqhttp and LLOneBot extensions,
 * camelCased. Each takes one object of the action's parameters, as the OneBot documentation has them, and resolves
 * to the action's \`data\`; a \`message_id\` may be a \`session.messageId\`.
 */
export interface LuckyLilliaInternal {
${names.account.map(([name, action]) => `  /** \`${action}\` */\n  ${name}(params?: Record<string, unknown>): Promise<any>`).join('\n')}
}

/**
 * \`bot.internal\` of the QQ official bot (\`qq\`): the open platform's group, C2C and guild endpoints. Path
 * parameters are raw Tencent IDs (without the neutral API's \`qqguild:\` prefix), in order; then the body, or the
 * query for GET and DELETE. \`sendMessage\` / \`deleteMessage\` act on groups; \`sendGuildMessage\` /
 * \`deleteGuildMessage\` act on guild channels.
 */
export interface QQInternal {
${methods(names.qq)}
}

/**
 * Legacy guild endpoint type, kept for source compatibility.
 * @deprecated Use QQInternal on the \`qq\` bot. Guild sends/deletes use \`sendGuildMessage\` / \`deleteGuildMessage\`.
 */
export interface QQGuildInternal {
${methods(names.legacyGuild)}
}

export interface PlatformInternals {
  luckylillia: LuckyLilliaInternal
  qq: QQInternal
}

/**
 * The bot's \`internal\` with the methods of its platform typed, when the bot is on that platform; undefined otherwise:
 * \`internalOf(session.bot, 'luckylillia')?.setGroupCard({ group_id, user_id, card })\`.
 */
export function internalOf<P extends keyof PlatformInternals>(bot: Bot, platform: P): PlatformInternals[P] | undefined {
  return bot.platform === platform ? bot.internal as unknown as PlatformInternals[P] : undefined
}
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const content = renderInternal()
  if (process.argv.includes('--check')) {
    const current = readFileSync(SDK_INTERNAL, 'utf8').replace(/\r\n/g, '\n')
    if (current !== content) {
      console.error(`${SDK_INTERNAL} is out of date: run scripts/gen-sdk-internal.mts`)
      process.exit(1)
    }
  } else {
    writeFileSync(SDK_INTERNAL, content)
    console.log(`wrote ${SDK_INTERNAL}`)
  }
}
