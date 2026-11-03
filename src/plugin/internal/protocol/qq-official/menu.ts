import { isDeepStrictEqual } from 'node:util'
import { Context } from 'cordis'
import type { QQOfficialConfig, QQOfficialMenuItem, QQOfficialPanelItem } from '@/common/types'
import { ApiError } from './api'
import type { GroupInternal } from './internal'
import type { MenuItem, PanelItem, PanelRecord, SubMenuItem } from './types'

// The C2C custom menu and the group command panel

const PANEL_REMARK = 'llbot-qq-official'
/** The panel API takes about one write per this many ms */
const PANEL_WRITE_INTERVAL = 6500
const MENU_MAX = 10
const PANEL_MAX = 20
/** Too many panels */
const QUANTITY_LIMIT = 40030013
/** The panel is gone already */
const PANEL_NOT_FOUND = 40030006

/** A command as a command framework lists it (Satori's Command, minus what the menus do not use). */
export interface MenuCommand {
  name: string
  description?: string | Record<string, string>
  children?: MenuCommand[]
}

type MenuConfig = Pick<QQOfficialConfig, 'privateSlash' | 'privateMenu' | 'groupSlash' | 'groupPanels'>

const truncate = (value: string, max: number) => Array.from(value).slice(0, max).join('')
const slash = (name: string) => name.startsWith('/') ? name : `/${name}`

function describe(command: MenuCommand) {
  const { description } = command
  if (typeof description === 'string') return description || command.name
  return description?.[''] || description?.['zh-CN'] || command.name
}

function toMenuItem(item: QQOfficialMenuItem): MenuItem {
  switch (item.type) {
    case 'send_message':
      return { name: item.name, type: 'send_message', send_message: item.value ?? '' }
    case 'link':
      return { name: item.name, type: 'link', link: item.value ?? '' }
    case 'switch':
      return { name: item.name, type: 'switch', switch: { switch_id: item.value || item.name, default: !!item.switchDefault } }
    case 'menu':
      return {
        name: item.name,
        type: 'menu',
        sub_menu_items: (item.subMenuItems ?? []).map(sub => sub.type === 'link'
          ? { name: sub.name, type: 'link', link: sub.value ?? '' }
          : { name: sub.name, type: 'send_message', send_message: sub.value ?? '' }),
      }
  }
}

function toPanelItem(item: QQOfficialPanelItem): PanelItem {
  return {
    name: item.name,
    desc: item.description ?? '',
    type: item.type,
    only_admin: !!item.onlyAdmin,
    ...(item.type === 'link' ? { link: item.value ?? '' } : {}),
  }
}

/** C2C menu from commands: a command with subcommands becomes a submenu of them */
function commandMenu(commands: MenuCommand[]): MenuItem[] {
  return commands.slice(0, MENU_MAX).map((command) => {
    const children = (command.children ?? []).slice(0, 5)
    if (!children.length) return { name: truncate(command.name, 9), type: 'send_message', send_message: slash(command.name) }
    return {
      name: truncate(command.name, 9),
      type: 'menu',
      sub_menu_items: children.map((child): SubMenuItem => ({
        name: truncate(child.name, 13), type: 'send_message', send_message: slash(child.name),
      })),
    }
  })
}

/** Group panel from commands: top-level ones only, subcommands would overflow it */
function commandPanel(commands: MenuCommand[]): PanelItem[] {
  return commands.slice(0, PANEL_MAX).map(command => ({
    name: truncate(slash(command.name), 14),
    desc: truncate(describe(command), 30),
    type: 'command',
    only_admin: false,
  }))
}

// The platform leaves out empty fields; compare in one shape
function normalizeMenu(items: MenuItem[] = []): MenuItem[] {
  return items.map((item) => {
    if (item.type === 'send_message') return { name: item.name, type: item.type, send_message: item.send_message ?? '' }
    if (item.type === 'link') return { name: item.name, type: item.type, link: item.link ?? '' }
    if (item.type === 'menu') {
      return {
        name: item.name,
        type: item.type,
        sub_menu_items: (item.sub_menu_items ?? []).map(sub => sub.type === 'send_message'
          ? { name: sub.name, type: sub.type, send_message: sub.send_message ?? '' }
          : { name: sub.name, type: sub.type, link: sub.link ?? '' }),
      }
    }
    return { name: item.name, type: item.type, switch: { switch_id: item.switch?.switch_id ?? '', default: !!item.switch?.default } }
  })
}

function normalizePanel(items: PanelItem[] = []): PanelItem[] {
  return items.map(item => ({
    name: item.name,
    desc: item.desc ?? '',
    type: item.type,
    only_admin: !!item.only_admin,
    ...(item.type === 'link' ? { link: item.link ?? '' } : {}),
  }))
}

const codeOf = (error: unknown) => error instanceof ApiError ? error.code : undefined

export class MenuManager {
  private disposed = false
  private syncing?: Promise<void>
  private lastPanelWrite = 0
  private panelQueue: Promise<void> = Promise.resolve()
  private logger

  constructor(private ctx: Context, private internal: GroupInternal, private config: MenuConfig, private wait = PANEL_WRITE_INTERVAL) {
    this.logger = ctx.logger('qq-official')
  }

  dispose() {
    this.disposed = true
  }

  /** Puts the configured menu and panel in place; each is left alone when its list is empty. */
  sync(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    return this.syncing ??= this.run().finally(() => {
      this.syncing = undefined
    })
  }

  /** The command framework's commands, for the menus switched to follow them. */
  async updateCommands(commands: MenuCommand[]) {
    if (this.disposed || !commands.length) return
    if (this.config.privateSlash) {
      if (commands.length > MENU_MAX) this.logger.warn('单聊菜单最多 %d 项，只同步前 %d 个指令', MENU_MAX, MENU_MAX)
      await this.syncMenu(commandMenu(commands)).catch(e => this.logger.warn('同步单聊指令菜单失败: %s', (e as Error).message))
    }
    if (this.disposed || !this.config.groupSlash) return
    if (commands.length > PANEL_MAX) this.logger.warn('群聊指令面板最多 %d 项，只同步前 %d 个指令', PANEL_MAX, PANEL_MAX)
    await this.syncPanel(commandPanel(commands)).catch(e => this.warnPanel('同步群聊指令面板失败', e))
  }

  private async run() {
    // Independent: a failing menu must not keep the panel from syncing
    if (!this.config.privateSlash && this.config.privateMenu?.length) {
      await this.syncMenu(this.config.privateMenu.map(toMenuItem)).catch(e => this.logger.warn('同步单聊自定义菜单失败: %s', (e as Error).message))
    }
    if (this.disposed) return
    if (!this.config.groupSlash && this.config.groupPanels?.length) {
      await this.syncPanel(this.config.groupPanels.map(toPanelItem)).catch(e => this.warnPanel('同步群聊指令面板失败', e))
    }
  }

  private warnPanel(message: string, error: unknown) {
    if (codeOf(error) === QUANTITY_LIMIT) this.logger.warn('%s: 指令面板数量超出平台限制', message)
    else this.logger.warn('%s: %s', message, (error as Error).message)
  }

  private async syncMenu(items: MenuItem[]) {
    const current = await this.internal.getMenu()
    if (isDeepStrictEqual(normalizeMenu(current?.menu?.items), normalizeMenu(items))) return
    await this.internal.setMenu({ menu: { items } })
  }

  /** One panel for every group: kept up to date, any other panel deleted to free the quota. */
  private async syncPanel(items: PanelItem[]) {
    const records = await this.listPanels()
    const target = records.find(record => record.target_type === 'all')
    if (!target) {
      for (const record of records) {
        await this.deletePanel(record)
        if (this.disposed) return
      }
      await this.writeSlot()
      if (this.disposed) return
      await this.internal.createPanel({ scope: 'group', target_type: 'all', panel: { items, remark: PANEL_REMARK } })
      return
    }
    if (!isDeepStrictEqual(normalizePanel(target.panel?.items), normalizePanel(items))) {
      await this.writeSlot()
      if (this.disposed) return
      await this.internal.modifyPanel(target.panel_id, { panel: { items, remark: target.panel?.remark ?? PANEL_REMARK } })
    }
    for (const record of records) {
      if (this.disposed) return
      if (record.panel_id !== target.panel_id) await this.deletePanel(record)
    }
  }

  private async deletePanel(record: PanelRecord) {
    await this.writeSlot()
    if (this.disposed) return
    try {
      await this.internal.deletePanel(record.panel_id)
    } catch (e) {
      if (codeOf(e) !== PANEL_NOT_FOUND) throw e
    }
  }

  private async listPanels(): Promise<PanelRecord[]> {
    const records: PanelRecord[] = []
    const seen = new Set<string>()
    let cursor = ''
    while (!this.disposed) {
      const page = await this.internal.getPanels({ scope: 'group', cursor, limit: 50 })
      records.push(...(page?.records ?? []))
      if (page?.is_end || !page?.next_cursor || seen.has(page.next_cursor)) break
      seen.add(page.next_cursor)
      cursor = page.next_cursor
    }
    return records
  }

  private async writeSlot() {
    const previous = this.panelQueue
    let release!: () => void
    this.panelQueue = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    try {
      const delay = this.lastPanelWrite + this.wait - Date.now()
      if (delay > 0) await new Promise<void>(resolve => this.ctx.timeout(resolve, delay))
      this.lastPanelWrite = Date.now()
    } finally {
      release()
    }
  }
}
