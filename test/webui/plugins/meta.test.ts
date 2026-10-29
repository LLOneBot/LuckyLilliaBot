import { describe, expect, it } from 'vitest'
import { findConflicts, pendingReason, serviceLabel } from '@/plugin/internal/service/webui/FE/components/plugins/meta'
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
