import { describe, expect, it } from 'vitest'
import { adapterDefaults } from '@/main/config/defaultConfig'
import { SatoriSchema, satoriSettings } from '@/main/builtinConfig/satori'
import { MilkySchema, milkySettings } from '@/main/builtinConfig/milky'
import { OB11Schema, ob11Settings } from '@/main/builtinConfig/onebot'
import defaultConfigFile from '@/main/config/default_config.json'

// The entry switch replaced each section's `enable`
const withoutEnable = <T extends { enable: boolean }>({ enable: _enable, ...rest }: T) => rest

describe('Satori settings', () => {
  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new SatoriSchema()).toEqual(withoutEnable(adapterDefaults.satori))
  })

  it('starts a new entry from default_config.json, its enable being the entry switch', () => {
    expect(satoriSettings.initial!()).toEqual({ enabled: defaultConfigFile.satori.enable, config: withoutEnable(defaultConfigFile.satori) })
  })

  it('requires a token for a public listener, only while it runs', () => {
    const open = { host: '', port: 5600, token: '' }
    expect(satoriSettings.check!(open, true)).toEqual([{ path: ['token'], message: 'Satori 监听全部地址时必须设置 Token' }])
    expect(satoriSettings.check!(open, false)).toEqual([])
    expect(satoriSettings.checkOnEnable).toBe(true)
  })
})

describe('Milky settings', () => {
  const valid = (patch: object = {}) => ({ ...structuredClone(withoutEnable(adapterDefaults.milky)), ...patch })

  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new MilkySchema()).toEqual(withoutEnable(adapterDefaults.milky))
  })

  it('drops the blank webhook rows the form leaves behind', () => {
    const value = valid({ webhook: { urls: ['https://a.test/hook', '', '  '], accessToken: '' } })
    expect(milkySettings.normalize!(value).webhook.urls).toEqual(['https://a.test/hook'])
  })

  it('refuses a webhook that is not http(s)', () => {
    const value = valid({ webhook: { urls: ['ftp://a.test'], accessToken: '' } })
    const result = MilkySchema['~standard'].validate(value) as { issues?: { path?: unknown[] }[] }
    expect(result.issues?.length).toBeGreaterThan(0)
  })

  it('requires an access token for a public HTTP listener while it runs', () => {
    const value = valid({ http: { ...adapterDefaults.milky.http, host: '' } })
    expect(milkySettings.check!(value, true)).toEqual([{ path: ['http', 'accessToken'], message: 'Milky HTTP 监听全部地址时必须设置 Token' }])
    expect(milkySettings.check!(value, false)).toEqual([])
  })
})

describe('OneBot 11 settings', () => {
  const validate = (value: unknown) => (OB11Schema['~standard'].validate(value) as { issues?: unknown[] }).issues ?? []
  const ws = { type: 'ws', enable: true, host: '127.0.0.1', port: 3001, heartInterval: 60000, token: '', reportSelfMessage: false, reportOfflineMessage: false, messageFormat: 'array', debug: false }

  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new OB11Schema()).toEqual(withoutEnable(adapterDefaults.ob11))
  })

  it('starts a new entry with the rows and the switch of default_config.json', () => {
    const initial = ob11Settings.initial!()
    expect(initial).toEqual({ enabled: defaultConfigFile.ob11.enable, config: { connect: defaultConfigFile.ob11.connect } })
    expect(validate(initial.config)).toEqual([])
  })

  it('accepts the shape the desktop app writes: every field on every row, null name and filter', () => {
    const reverse = { ...ws, type: 'ws-reverse', url: 'ws://127.0.0.1:8080', name: null, filter: null }
    expect(validate({ connect: [reverse] })).toEqual([])
  })

  it('accepts an old migrated ws row without a host', () => {
    const { host: _host, ...legacy } = ws
    expect(validate({ connect: [legacy] })).toEqual([])
  })

  it('refuses an unknown connection type and an out-of-range port', () => {
    expect(validate({ connect: [{ ...ws, type: 'tcp' }] }).length).toBeGreaterThan(0)
    expect(validate({ connect: [{ ...ws, port: 70000 }] }).length).toBeGreaterThan(0)
  })

  it('points the token rule at the offending row, only while it runs', () => {
    const value = { connect: [ws, { ...ws, host: '' }] }
    expect(ob11Settings.check!(value as never, true)).toEqual([
      { path: ['connect', '1', 'token'], message: 'OneBot11 WebSocket 适配器监听全部地址时必须设置 Token' },
    ])
    expect(ob11Settings.check!(value as never, false)).toEqual([])
  })
})
