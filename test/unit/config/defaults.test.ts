import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { adapterDefaults, defaultConfig } from '@/main/config/defaultConfig'

const jsonPath = path.resolve('src/main/config/default_config.json')
const fromFile = JSON5.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>

describe('the two default config sources', () => {
  // They used to drift: logLevel lived only in the JSON, and the whitelist cleanup keyed off the TS
  // object deleted it from every account's config on each reload.
  // The JSON still carries the adapters' sections: a new instance's adapter entries start from them
  it('declare the same top-level keys', () => {
    expect(Object.keys(fromFile).sort()).toEqual(Object.keys({ ...defaultConfig, ...adapterDefaults }).sort())
  })

  it('both carry logLevel', () => {
    expect(fromFile.logLevel).toBe('info')
    expect(defaultConfig.logLevel).toBe('info')
  })

  it('agree on the scalar defaults they share', () => {
    for (const [key, value] of Object.entries(fromFile)) {
      if (value === null || typeof value === 'object') continue
      expect({ key, value: (defaultConfig as Record<string, unknown>)[key] }).toEqual({ key, value })
    }
  })
})
