import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QQOfficialConfig } from '@/common/types'
import { ApiError } from '@/plugin/internal/protocol/qq-official/api'
import type { GroupInternal } from '@/plugin/internal/protocol/qq-official/internal'
import { MenuManager } from '@/plugin/internal/protocol/qq-official/menu'
import type { PanelRecord } from '@/plugin/internal/protocol/qq-official/types'

let ctx: Context
let records: PanelRecord[]
let menuItems: unknown[]
let internal: Record<string, ReturnType<typeof vi.fn>>

const config = (overrides: Partial<QQOfficialConfig> = {}) => ({
  privateSlash: false, privateMenu: [], groupSlash: false, groupPanels: [], ...overrides,
}) as Pick<QQOfficialConfig, 'privateSlash' | 'privateMenu' | 'groupSlash' | 'groupPanels'>

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(TimerService)
  records = []
  menuItems = []
  internal = {
    getMenu: vi.fn(async () => ({ menu: { items: menuItems } })),
    setMenu: vi.fn(async () => ({ version: 2 })),
    getPanels: vi.fn(async () => ({ records, is_end: true })),
    createPanel: vi.fn(async () => ({ panel_id: 'new' })),
    modifyPanel: vi.fn(async () => ({ version: 2 })),
    deletePanel: vi.fn(async () => ({})),
  }
})

const manager = (overrides: Partial<QQOfficialConfig>, wait = 0) =>
  new MenuManager(ctx, internal as unknown as GroupInternal, config(overrides), wait)

describe('MenuManager', () => {
  it('leaves a menu alone that already matches, as the platform reports it', async () => {
    menuItems = [{ name: '帮助', type: 'send_message', send_message: '/help' }]
    await manager({ privateMenu: [{ type: 'send_message', name: '帮助', value: '/help' }] }).sync()
    expect(internal.setMenu).not.toHaveBeenCalled()
  })

  it('builds every kind of menu item', async () => {
    await manager({
      privateMenu: [
        { type: 'link', name: '官网', value: 'https://example.com' },
        { type: 'switch', name: '提醒', value: 'remind', switchDefault: true },
        { type: 'menu', name: '更多', subMenuItems: [{ type: 'send_message', name: '签到', value: '/sign' }] },
      ],
    }).sync()
    expect(internal.setMenu).toHaveBeenCalledWith({
      menu: {
        items: [
          { name: '官网', type: 'link', link: 'https://example.com' },
          { name: '提醒', type: 'switch', switch: { switch_id: 'remind', default: true } },
          { name: '更多', type: 'menu', sub_menu_items: [{ name: '签到', type: 'send_message', send_message: '/sign' }] },
        ],
      },
    })
  })

  it('keeps one panel for every group: changes it, deletes the others, one write per interval', async () => {
    records = [
      { panel_id: 'p1', scope: 'group', target_type: 'specific', panel: { items: [] } },
      { panel_id: 'p2', scope: 'group', target_type: 'all', panel: { items: [{ name: '/old', type: 'command' }], remark: 'mine' } },
    ]
    const writes: number[] = []
    for (const name of ['modifyPanel', 'deletePanel']) {
      internal[name].mockImplementation(async () => {
        writes.push(Date.now())
        return {}
      })
    }
    await manager({ groupPanels: [{ type: 'command', name: '/help', description: '', onlyAdmin: true }] }, 40).sync()
    expect(internal.modifyPanel).toHaveBeenCalledWith('p2', {
      panel: { items: [{ name: '/help', desc: '', type: 'command', only_admin: true }], remark: 'mine' },
    })
    expect(internal.deletePanel).toHaveBeenCalledWith('p1')
    expect(internal.createPanel).not.toHaveBeenCalled()
    expect(writes[1] - writes[0]).toBeGreaterThanOrEqual(35)
  })

  it('reports a panel quota error without throwing', async () => {
    internal.createPanel.mockRejectedValue(new ApiError('too many', 400, 40030013))
    const menu = manager({ groupPanels: [{ type: 'command', name: '/a', description: '', onlyAdmin: false }] })
    const warn = vi.spyOn(menu['logger'], 'warn')
    await menu.sync()
    expect(internal.createPanel).toHaveBeenCalled()
    expect(warn.mock.calls.flat().join(' ')).toContain('数量超出')
  })

  it('follows the commands it is given when set to', async () => {
    const commands = [
      { name: 'help', description: { '': '查看帮助' } },
      { name: 'game', description: '游戏', children: [{ name: 'game.start' }, { name: 'game.stop' }] },
    ]
    await manager({}).updateCommands(commands)
    expect(internal.setMenu).not.toHaveBeenCalled()
    await manager({ privateSlash: true, groupSlash: true }).updateCommands(commands)
    expect(internal.setMenu).toHaveBeenCalledWith({
      menu: {
        items: [
          { name: 'help', type: 'send_message', send_message: '/help' },
          {
            name: 'game',
            type: 'menu',
            sub_menu_items: [
              { name: 'game.start', type: 'send_message', send_message: '/game.start' },
              { name: 'game.stop', type: 'send_message', send_message: '/game.stop' },
            ],
          },
        ],
      },
    })
    expect(internal.createPanel.mock.calls[0][0].panel.items).toEqual([
      { name: '/help', desc: '查看帮助', type: 'command', only_admin: false },
      { name: '/game', desc: '游戏', type: 'command', only_admin: false },
    ])
  })
})
