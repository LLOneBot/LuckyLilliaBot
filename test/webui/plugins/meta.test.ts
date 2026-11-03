import { describe, expect, it } from 'vitest'
import {
  findConflicts, pendingReason, pluginDescription, pluginTitle, serviceLabel, waitingFor,
} from '@/plugin/internal/service/webui/FE/components/plugins/meta'
import { PluginStatus } from '@/plugin/internal/service/webui/FE/types/plugins'

function entry(id: string, implementsList: string[], disabled = false): PluginStatus {
  return {
    id,
    name: `pkg-${id}`,
    manifest: {},
    disabled,
    state: disabled ? 'disposed' : 'active',
    missingDeps: [],
    reloadCount: 0,
    service: { required: [], optional: [], implements: implementsList },
  }
}

describe('findConflicts', () => {
  it('pairs up enabled entries that implement the same service', () => {
    const deepl = entry('deepl', ['translator'])
    const google = entry('google', ['translator', 'ocr'])
    const baidu = entry('baidu', ['ocr'])
    const conflicts = findConflicts([deepl, google, baidu])
    expect(conflicts.get('deepl')).toEqual([{ service: 'translator', with: [google] }])
    expect(conflicts.get('google')).toEqual([
      { service: 'translator', with: [deepl] },
      { service: 'ocr', with: [baidu] },
    ])
    expect(conflicts.get('baidu')).toEqual([{ service: 'ocr', with: [google] }])
  })

  it('ignores disabled entries', () => {
    const conflicts = findConflicts([entry('deepl', ['translator']), entry('google', ['translator'], true)])
    expect(conflicts.size).toBe(0)
  })
})

describe('pluginTitle', () => {
  it('takes llbot.title, in Chinese when it is a map, else the package name without the plugin prefix', () => {
    const named = (name: string, manifest: PluginStatus['manifest']) => ({ ...entry('x', []), name, manifest })
    expect(pluginTitle(named('luckylillia-plugin-echo', { title: '复读' }))).toBe('复读')
    expect(pluginTitle(named('luckylillia-plugin-echo', { title: { en: 'Echo', zh: '复读' } }))).toBe('复读')
    expect(pluginTitle(named('luckylillia-plugin-echo', { title: { en: 'Echo' } }))).toBe('Echo')
    expect(pluginTitle(named('@me/luckylillia-plugin-echo', { title: '  ' }))).toBe('echo')
    // A builtin's own title comes first
    expect(pluginTitle({ ...named('builtin:proxy', { title: 'x' }), title: '代理' })).toBe('代理')
  })

  it('falls back from an empty llbot.description to the one in package.json', () => {
    expect(pluginDescription({ ...entry('x', []), manifest: { description: ' ' }, description: '包的说明' })).toBe('包的说明')
  })
})

describe('pendingReason', () => {
  const nt = { ...entry('nt', ['qqProtocol', 'account']), title: 'NTQQ 协议' }
  nt.service.labels = { account: 'NTQQ 账号登录' }
  const waiting = (...missingDeps: string[]): PluginStatus => ({ ...entry('ob', []), state: 'pending', missingDeps })

  it('names what a provider says the service stands for, and only that', () => {
    expect(pendingReason(waiting('account', 'app', 'store'), [nt])).toBe('等待：NTQQ 账号登录')
    expect(serviceLabel('account', [nt])).toBe('NTQQ 账号登录')
  })

  it('points at the provider when it is switched off', () => {
    expect(pendingReason(waiting('account'), [{ ...nt, disabled: true }])).toBe('需要先启用「NTQQ 协议」')
  })

  it('falls back to the bot service names, then the raw ones', () => {
    expect(pendingReason(waiting('database', 'translator'), [])).toBe('等待服务：数据库、translator')
    expect(pendingReason({ ...waiting('account'), state: 'active' }, [nt])).toBeUndefined()
  })
})

describe('waitingFor', () => {
  const nt = { ...entry('nt', ['qqProtocol', 'account']), title: 'NTQQ 协议' }
  nt.service.labels = { account: 'NTQQ 账号登录' }
  const translator = entry('deepl', ['translator'], true)
  const waiting = (...missingDeps: string[]): PluginStatus => ({ ...entry('webqq', []), state: 'pending', missingDeps })

  it('names the provider of what is missing, with the label it gives the service', () => {
    expect(waitingFor(waiting('app', 'account'), [nt])).toEqual({ provider: nt, label: 'NTQQ 账号登录' })
  })

  it('puts a provider that is switched off first: nothing else helps until it runs', () => {
    expect(waitingFor(waiting('account', 'translator'), [nt, translator])).toEqual({ provider: translator, label: undefined })
  })

  it('has nobody to name while only services the bot brings up by itself are missing, or nothing is', () => {
    expect(waitingFor(waiting('app', 'store'), [nt])).toBeUndefined()
    expect(waitingFor({ ...waiting('account'), state: 'active' }, [nt])).toBeUndefined()
  })
})
