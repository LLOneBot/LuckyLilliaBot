import h from '@satorijs/element'
import { Context, Service } from 'cordis'
import type {
  Argv, Bot, Command as CommandApi, CommandAction, CommandConfig, CommandInfo, Commands, OptionConfig, Session, Universal,
} from '@luckylillia/plugin-sdk'
import type BotsService from './bots'

/** The command settings (builtin:commands), changed in place: the service and its commands stay. */
export interface CommandSettings {
  /** What a command may start with */
  prefixes: string[]
  /** A command may go without a prefix too */
  bare: boolean
  /** `platform:userId`, or a user id on every platform: they may run every command. */
  owners: string[]
  /** The help command. */
  help: boolean
}

export const DEFAULT_SETTINGS: CommandSettings = { prefixes: ['/'], bare: true, owners: [], help: true }

interface Declaration {
  name: string
  type: string
  required: boolean
}

interface OptionDeclaration {
  name: string
  flags: string[]
  param?: Declaration
  description: string
  fallback?: unknown
}

export class ArgvError extends Error {}

const TYPES = new Set(['string', 'text', 'number', 'integer', 'posint', 'natural', 'user'])
const PARAM = /^([<[])([^:>\]]+)(?::([^>\]]+))?[>\]]$/
const MENU_DELAY = 2_000

function parseParam(token: string): Declaration | undefined {
  const match = PARAM.exec(token)
  if (!match) return
  const type = (match[3] ?? 'string').trim()
  if (!TYPES.has(type)) throw new TypeError(`unknown parameter type ${type} in ${token}`)
  return { name: match[2].trim(), type, required: match[1] === '<' }
}

function parseDef(def: string): { name: string; args: Declaration[] } {
  const [name, ...rest] = def.trim().split(/\s+/)
  if (!name) throw new TypeError('a command needs a name')
  const args = rest.map((token) => {
    const param = parseParam(token)
    if (!param) throw new TypeError(`expected <param> or [param] in "${def}", got ${token}`)
    return param
  })
  if (args.slice(0, -1).some(arg => arg.type === 'text')) throw new TypeError(`only the last parameter of "${def}" can be text`)
  return { name, args }
}

function parseOption(name: string, syntax: string, config: OptionConfig = {}): OptionDeclaration {
  const tokens = syntax.trim().split(/\s+/).filter(Boolean)
  const flags: string[] = []
  let param: Declaration | undefined
  let i = 0
  for (; i < tokens.length; i++) {
    const token = tokens[i].replace(/,$/, '')
    if (/^--?[^-\s\d]/.test(token)) {
      flags.push(token)
      continue
    }
    if (!param && (param = parseParam(token))) continue
    break
  }
  if (!flags.includes(`--${name}`)) flags.push(`--${name}`)
  return { name, flags, param, description: tokens.slice(i).join(' '), fallback: config.fallback }
}

const formatParam = (param: Declaration) => {
  const inner = param.type === 'string' ? param.name : `${param.name}:${param.type}`
  return param.required ? `<${inner}>` : `[${inner}]`
}

interface Token {
  /** Element markup */
  value: string
  /** Its element, when the word is nothing else */
  element?: h
  /** The markup from this word on */
  rest: string
}

const QUOTED = /"([^"]*)"|'([^']*)'|“([^”]*)”|「([^」]*)」|(\S+)/g
// Elements stand in the text as private-use characters around their index while it is split into words
const PLACEHOLDER = /(\d+)/g
const ONLY_PLACEHOLDER = /^(\d+)$/

/** The words of a message, elements kept whole: an @ never falls apart at the blank inside its markup. */
export function tokenize(markup: string): Token[] {
  const elements: h[] = []
  let flat = ''
  for (const element of h.parse(markup)) {
    if (element.type === 'text') flat += h.escape(String(element.attrs.content ?? ''))
    else flat += `${elements.push(element) - 1}`
  }
  const restore = (value: string) => value.replace(PLACEHOLDER, (_, index) => elements[+index].toString())
  return [...flat.matchAll(QUOTED)].map((match) => {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]
    const only = ONLY_PLACEHOLDER.exec(raw)
    return { value: restore(raw), element: only ? elements[+only[1]] : undefined, rest: restore(flat.slice(match.index)) }
  })
}

function convert(param: Declaration, token: Token): unknown {
  const fail = (what: string) => {
    throw new ArgvError(`参数 ${param.name} 应该是${what}，收到的是 ${h.unescape(token.value)}`)
  }
  const number = Number(h.unescape(token.value))
  switch (param.type) {
    case 'number':
      return Number.isFinite(number) ? number : fail('数字')
    case 'integer':
      return Number.isInteger(number) ? number : fail('整数')
    case 'posint':
      return Number.isInteger(number) && number > 0 ? number : fail('正整数')
    case 'natural':
      return Number.isInteger(number) && number >= 0 ? number : fail('非负整数')
    case 'user':
      if (token.element) return token.element.type === 'at' && token.element.attrs.id ? String(token.element.attrs.id) : fail('一个 @ 或用户 id')
      return h.unescape(token.value)
    default:
      return token.value
  }
}

export class Command implements CommandApi {
  readonly name: string
  readonly args: Declaration[]
  readonly aliases: string[] = []
  readonly options: OptionDeclaration[] = []
  readonly usages: string[] = []
  readonly examples: string[] = []
  handler?: CommandAction
  disposeCommand?: () => void

  constructor(readonly ctx: Context, def: string, readonly description: string, readonly config: CommandConfig) {
    const { name, args } = parseDef(def)
    this.name = name
    this.args = args
  }

  get names() {
    return [this.name, ...this.aliases]
  }

  get syntax() {
    return [this.name, ...this.args.map(formatParam)].join(' ')
  }

  alias(...names: string[]) {
    for (const name of names) {
      if (name && !this.names.includes(name)) this.aliases.push(name)
    }
    return this
  }

  option(name: string, syntax: string, config?: OptionConfig) {
    this.options.push(parseOption(name, syntax, config))
    return this
  }

  usage(text: string) {
    this.usages.push(text)
    return this
  }

  example(text: string) {
    this.examples.push(text)
    return this
  }

  action(action: CommandAction) {
    this.handler = action
    return this
  }

  dispose() {
    this.disposeCommand?.()
  }

  /** Reads what follows the name; words beyond the parameters are left out. */
  parse(rest: string): { options: Record<string, any>; args: any[] } {
    const options: Record<string, any> = {}
    for (const option of this.options) {
      if (option.fallback !== undefined) options[option.name] = option.fallback
    }
    const args: any[] = []
    const tokens = tokenize(rest)
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const [flag, inline] = token.element ? [] : h.unescape(token.value).split(/=(.*)/s)
      const option = flag ? this.options.find(option => option.flags.includes(flag)) : undefined
      if (option) {
        if (!option.param) {
          options[option.name] = true
          continue
        }
        const value = inline !== undefined ? { ...token, value: h.escape(inline) } : tokens[++i]
        if (!value) throw new ArgvError(`选项 ${flag} 后面要跟 ${formatParam(option.param)}`)
        options[option.name] = convert(option.param, value)
        continue
      }
      const param = this.args[args.length]
      if (!param) continue
      if (param.type === 'text') {
        args.push(token.rest.trim())
        break
      }
      args.push(convert(param, token))
    }
    const missing = this.args.slice(args.length).find(param => param.required)
    if (missing) throw new ArgvError(`缺少参数 ${missing.name}`)
    return { options, args }
  }

  help(): string {
    const lines = [this.syntax]
    if (this.description) lines.push(this.description)
    if (this.aliases.length) lines.push(`别名：${this.aliases.join('、')}`)
    if (this.options.length) {
      lines.push('选项：')
      for (const option of this.options) {
        const flags = option.flags.join(', ') + (option.param ? ` ${formatParam(option.param)}` : '')
        lines.push(`  ${flags}${option.description ? `  ${option.description}` : ''}`)
      }
    }
    lines.push(...this.usages)
    if (this.examples.length) lines.push('示例：', ...this.examples.map(example => `  ${example}`))
    return lines.join('\n')
  }
}

/**
 * `ctx.command()`: every command, matched in one middleware. Called through ctx, `this.ctx` is the caller's
 * context, which is what a command belongs to; the service's own timers and logs use `home`. Those calls run on a
 * shadow of the instance: fields are changed in place, never reassigned.
 */
export class CommandService extends Service implements Commands {
  static inject = ['bots', 'timer']

  private readonly commands: Command[] = []
  private readonly cooldowns = new Map<string, number>()
  private readonly menus = new Map<string, string>()
  private readonly pending: { menus?: () => void } = {}
  private readonly home: Context
  private readonly helpCommand: Command

  constructor(ctx: Context, private readonly settings: { current: CommandSettings } = { current: DEFAULT_SETTINGS }) {
    super(ctx, 'commands')
    this.home = ctx
    ctx.mixin('commands', ['command'])
    ctx.on('bot/message', (session, next) => this.handle(session, next), { prepend: true })
    ctx.on('bot/status', (bot) => {
      if (bot.status === 1) this.syncMenu(bot)
    })
    this.helpCommand = this.command('help [command]', '查看有哪些指令，或者一个指令的用法') as Command
    this.helpCommand.alias('帮助').action(({ session }, name?: string) => this.helpFor(session, name))
  }

  private get bots(): BotsService {
    return this.home.get('bots') as BotsService
  }

  command(def: string, description = '', config: CommandConfig = {}): CommandApi {
    const command = new Command(this.ctx, def, description, config)
    command.disposeCommand = this.ctx.effect(() => {
      const clash = this.commands.find(other => other.names.some(name => command.names.some(mine => same(name, mine))))
      if (clash) this.home.logger('commands').warn(`指令 ${command.name} 和已有的 ${clash.name} 重名，两个插件都收的消息由先注册的处理`)
      this.commands.push(command)
      this.scheduleMenus()
      return () => {
        const index = this.commands.indexOf(command)
        if (index >= 0) this.commands.splice(index, 1)
        this.scheduleMenus()
      }
    }, `ctx.command(${JSON.stringify(command.name)})`)
    return command
  }

  list(): CommandInfo[] {
    return this.commands.filter(command => this.enabled(command)).map((command) => {
      const conflicts: CommandInfo['conflicts'] = []
      for (const other of this.commands) {
        if (other === command || !this.enabled(other)) continue
        for (const name of command.names) {
          if (other.names.some(theirs => same(theirs, name))) conflicts.push({ name, with: this.bots.ownerOf(other.ctx) })
        }
      }
      return {
        name: command.name,
        aliases: [...command.aliases],
        description: command.description,
        syntax: command.syntax,
        hidden: !!command.config.hidden,
        authority: command.config.authority ?? 'everyone',
        owner: this.bots.ownerOf(command.ctx),
        conflicts,
      }
    })
  }

  private enabled(command: Command) {
    return command !== this.helpCommand || this.settings.current.help
  }

  /** The commands a session can see: with an action, enabled, of a plugin that takes the session. */
  private reachable(session: Session) {
    return this.commands.filter(command => command.handler && this.enabled(command) && this.bots.allows(command.ctx, session))
  }

  private async handle(session: Session, next: () => Promise<void>) {
    const found = this.match(session)
    if (!found) return next()
    const { command, rest } = found
    if (!await this.permitted(command, session)) {
      await session.send(h.text('你没有权限使用这个指令。'))
      return
    }
    const cooldown = command.config.cooldown
    const key = `${command.name}\n${session.platform}:${session.userId}`
    const last = this.cooldowns.get(key)
    if (cooldown && last !== undefined && Date.now() - last < cooldown) {
      await session.send(h.text(`请在 ${Math.ceil((cooldown - (Date.now() - last)) / 1000)} 秒后再试。`))
      return
    }
    let parsed: ReturnType<Command['parse']>
    try {
      parsed = command.parse(rest)
    } catch (error) {
      if (!(error instanceof ArgvError)) throw error
      await session.send(h.text(`${error.message}\n用法：${command.syntax}`))
      return
    }
    if (cooldown) this.cooldowns.set(key, Date.now())
    const argv: Argv = { session, command, ...parsed }
    let result: Awaited<ReturnType<CommandAction>>
    try {
      result = await command.handler!(argv, ...parsed.args)
    } catch (error) {
      command.ctx.logger('commands').warn(`指令 ${command.name} 出错:`, error)
      this.bots.reportFailure(command.ctx, error)
      await session.send(h.text('执行指令时出错了。'))
      return
    }
    if (result !== undefined && result !== null && result !== '') await session.send(result)
  }

  /** The command the message starts with, past a prefix; the longest name wins, then the first registered. */
  private match(session: Session): { command: Command; rest: string } | undefined {
    const content = session.stripped.content
    const { prefixes: given, bare } = this.settings.current
    const prefixes = [...new Set([...given.filter(Boolean), ...bare ? [''] : []])].sort((a, b) => b.length - a.length)
    const candidates = this.reachable(session)
    for (const prefix of prefixes) {
      if (!content.startsWith(prefix)) continue
      const body = content.slice(prefix.length)
      let best: { command: Command; name: string } | undefined
      for (const command of candidates) {
        for (const name of command.names) {
          if (body.length < name.length || !same(body.slice(0, name.length), name)) continue
          if (body.length > name.length && !/\s/.test(body[name.length])) continue
          if (!best || name.length > best.name.length) best = { command, name }
        }
      }
      if (best) return { command: best.command, rest: body.slice(best.name.length) }
    }
  }

  private isOwner(session: Session) {
    const id = session.userId
    return !!id && this.settings.current.owners.some(owner => owner === id || owner === `${session.platform}:${id}`)
  }

  private async permitted(command: Command, session: Session): Promise<boolean> {
    const authority = command.config.authority ?? 'everyone'
    if (authority === 'everyone' || this.isOwner(session)) return true
    if (authority === 'owner' || !session.guildId || !session.userId) return false
    type Role = { id?: string; name?: string }
    const known: Role[] | undefined = session.event.member?.roles
    const roles: Role[] | undefined = known?.length
      ? known
      : await session.bot.getGuildMember?.(session.guildId, session.userId).then(member => member?.roles, () => undefined)
    return !!roles?.some(role => ['owner', 'admin'].includes(role.name ?? role.id ?? ''))
  }

  /** As text: a syntax has angle brackets, which a string would turn into elements. */
  private helpFor(session: Session, name?: string): h {
    const visible = this.reachable(session)
    const prefix = this.settings.current.prefixes.find(Boolean) ?? ''
    if (name) {
      const wanted = h.unescape(name)
      const command = visible.find(command => command.names.some(alias => same(alias, wanted)))
      return h.text(command ? command.help() : `没有叫 ${wanted} 的指令。`)
    }
    const listed = visible.filter(command => !command.config.hidden)
    if (!listed.length) return h.text('还没有可用的指令。')
    return h.text([
      '可用的指令：',
      ...listed.map(command => `${prefix}${command.name}${command.description ? `  ${command.description}` : ''}`),
      `发送「${prefix}help 指令名」查看用法`,
    ].join('\n'))
  }

  private menu(): Universal.Command[] {
    return this.commands.filter(command => command.handler && this.enabled(command) && !command.config.hidden).map(command => ({
      name: command.name,
      description: { '': command.description },
      arguments: command.args.map(arg => ({ name: arg.name, description: {}, type: arg.type, required: arg.required })),
      options: command.options.map(option => ({
        name: option.name,
        description: { '': option.description },
        type: option.param?.type ?? 'boolean',
        required: false,
      })),
      children: [],
    }))
  }

  private scheduleMenus() {
    this.pending.menus?.()
    this.pending.menus = this.home.timeout(() => {
      for (const bot of this.bots) {
        if (bot.status === 1) this.syncMenu(bot)
      }
    }, MENU_DELAY)
  }

  /** Puts the commands on a bot's menu, unless it has these already. */
  private syncMenu(bot: Bot) {
    if (!bot.updateCommands) return
    const menu = this.menu()
    const key = JSON.stringify(menu)
    if (this.menus.get(bot.sid) === key) return
    this.menus.set(bot.sid, key)
    bot.updateCommands(menu).catch(e => this.home.logger('commands').warn(`同步 ${bot.sid} 的指令菜单失败:`, e))
  }
}

/** Names compare without case, for the Latin ones. */
function same(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase()
}
