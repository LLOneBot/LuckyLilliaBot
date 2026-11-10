import type h from '@satorijs/element'
import type { Session } from './universal.js'

/**
 * How a parameter is read: `string` (default) one word, `text` the rest of the message, `number`, `integer`,
 * `posint` (above 0), `natural` (0 and above), `user` the id of someone @-ed or typed out. Words are split at blanks;
 * quotes ("…", '…', “…”, 「…」) keep the blanks inside one. Words and text come as element markup, so sending them
 * on shows them as they were, @ included; `h.parse()` them for the elements.
 */
export type ArgumentType = 'string' | 'text' | 'number' | 'integer' | 'posint' | 'natural' | 'user'

export interface CommandConfig {
  /** Left out of the platforms' command menus. */
  hidden?: boolean
  /** Per user, in milliseconds: how long a user waits between two runs. */
  cooldown?: number
  /**
   * The default permission: `everyone` (default); `admin` group owners and admins too; `owner` only the owners
   * in the command settings. Users may override it for this command in the host's command settings.
   */
  authority?: 'everyone' | 'admin' | 'owner'
}

export interface OptionConfig {
  /** The value when the option is not given. */
  fallback?: unknown
}

export interface Argv {
  session: Session
  command: Command
  /** Continue the message middleware chain, at most once. Returning nothing does not continue it automatically. */
  next(): Promise<void>
  /** By name: a flag is `true`, an option with a parameter has its value. */
  options: Record<string, any>
  /** The arguments, also passed to the action after argv. */
  args: any[]
}

/** What it returns, if anything, goes back to the session's channel. */
export type CommandAction = (argv: Argv, ...args: any[]) => h.Fragment | void | Promise<h.Fragment | void>

export interface Command {
  readonly name: string
  readonly description: string
  /** Other names that run it. */
  alias(...names: string[]): this
  /**
   * `syntax`: its flags, a parameter, a description, e.g. `-t <seconds:number> 等多久`. `--<name>` always works; one
   * without a parameter is a flag, `true` when given.
   */
  option(name: string, syntax: string, config?: OptionConfig): this
  action(action: CommandAction): this
  /** Removes it early; the plugin's disposal removes it anyway. */
  dispose(): void
}

/** A command as the command list shows it. */
export interface CommandInfo {
  name: string
  aliases: string[]
  description: string
  /** `签到 [days:number]` */
  syntax: string
  hidden: boolean
  /** Effective permission, including the host's override. */
  authority: 'everyone' | 'admin' | 'owner'
  /** Permission declared by the plugin, or everyone when omitted. */
  defaultAuthority: 'everyone' | 'admin' | 'owner'
  /** The plugin entry it belongs to; undefined for the bot's own. */
  owner?: string
  /** Names or aliases another command has too: the one registered first runs where both plugins take a message. */
  conflicts: { name: string; with?: string }[]
}

export interface Commands {
  /** The same as `ctx.command()`. */
  command(def: string, description?: string, config?: CommandConfig): Command
  list(): CommandInfo[]
}

declare module 'cordis' {
  interface Context {
    commands: Commands
    /**
     * Registers a command, `def` being its name and parameters (`签到 [days:number]`). A message runs it when it
     * starts, after an @ of the bot, with one of the prefixes of the command settings (`/` or nothing by default)
     * and then its name or an alias. Needs `commands` in `inject`.
     */
    command(def: string, description?: string, config?: CommandConfig): Command
  }
}
