import { describe, expect, it } from 'vitest'
import { findConflicts } from '@/webui/FE/components/plugins/meta'
import { PluginStatus } from '@/webui/FE/types/plugins'

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
