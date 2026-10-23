import { Context, Service } from 'cordis'
import { describe, expect, it } from 'vitest'
import { Config as LLBotConfig } from '@/common/types'
import { deepMerge } from '@/common/utils/misc'
import { defaultConfig } from '@/main/config/defaultConfig'
import { SatoriSchema, satoriBinding } from '@/main/builtinConfig/satori'
import { MilkySchema, milkyBinding } from '@/main/builtinConfig/milky'
import { OB11Schema, ob11Binding } from '@/main/builtinConfig/onebot'
import defaultConfigFile from '@/main/config/default_config.json'

async function fakeConfig(accountFile: string | undefined) {
  let config = structuredClone(defaultConfig) as LLBotConfig
  const updates: LLBotConfig[] = []
  class FakeConfig extends Service {
    accountFile = accountFile
    constructor(ctx: Context) {
      super(ctx, 'config')
    }
    get() {
      return config
    }
    patch(partial: object) {
      config = deepMerge(config, partial) as LLBotConfig
      return config
    }
  }
  const ctx = new Context()
  await ctx.plugin(FakeConfig)
  ctx.on('llob/config-updated', next => void updates.push(next))
  return { ctx, updates, current: () => config }
}

describe('Satori settings binding', () => {
  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new SatoriSchema()).toEqual(defaultConfig.satori)
  })

  it('has nothing to bind to before an account file is known', async () => {
    expect(satoriBinding.read((await fakeConfig(undefined)).ctx)).toBeUndefined()
  })

  it('reads a copy of its section and writes it back as a patch the adapter hears about', async () => {
    const { ctx, updates, current } = await fakeConfig('config_1.json')
    const value = satoriBinding.read(ctx)!
    value.port = 1 // a copy: must not leak into the config
    expect(current().satori.port).toBe(5600)

    await satoriBinding.write(ctx, { ...defaultConfig.satori, enable: true, port: 5700 })
    expect(current().satori).toEqual({ ...defaultConfig.satori, enable: true, port: 5700 })
    expect(updates.at(-1)?.satori.port).toBe(5700)
    // the other sections are untouched
    expect(current().milky).toEqual(defaultConfig.milky)
  })

  it('requires a token for a public listener', () => {
    expect(satoriBinding.check!({ enable: true, host: '', port: 5600, token: '' })).toEqual([
      { path: ['token'], message: 'Satori 监听全部地址时必须设置 Token' },
    ])
    expect(satoriBinding.check!({ enable: true, host: '127.0.0.1', port: 5600, token: '' })).toEqual([])
    expect(satoriBinding.check!({ enable: false, host: '', port: 5600, token: '' })).toEqual([])
  })

  it('switches through the enable flag', () => {
    const on = satoriBinding.enabled.set({ ...defaultConfig.satori }, true)
    expect(on.enable).toBe(true)
    expect(satoriBinding.enabled.get(on)).toBe(true)
  })
})

describe('Milky settings binding', () => {
  const valid = (patch: object = {}) => ({ ...structuredClone(defaultConfig.milky), ...patch })

  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new MilkySchema()).toEqual(defaultConfig.milky)
  })

  it('drops the blank webhook rows the form leaves behind', () => {
    const value = valid({ webhook: { urls: ['https://a.test/hook', '', '  '], accessToken: '' } })
    expect(milkyBinding.normalize!(value).webhook.urls).toEqual(['https://a.test/hook'])
  })

  it('refuses a webhook that is not http(s)', () => {
    const value = valid({ webhook: { urls: ['ftp://a.test'], accessToken: '' } })
    const result = MilkySchema['~standard'].validate(value) as { issues?: { path?: unknown[] }[] }
    expect(result.issues?.length).toBeGreaterThan(0)
  })

  it('requires an access token for a public HTTP listener', () => {
    const value = valid({ enable: true, http: { ...defaultConfig.milky.http, host: '' } })
    expect(milkyBinding.check!(value)).toEqual([{ path: ['http', 'accessToken'], message: 'Milky HTTP 监听全部地址时必须设置 Token' }])
  })

  it('writes only its own section', async () => {
    const { ctx, current } = await fakeConfig('config_1.json')
    await milkyBinding.write(ctx, valid({ enable: true, reportSelfMessage: true }))
    expect(current().milky).toMatchObject({ enable: true, reportSelfMessage: true })
    expect(current().satori).toEqual(defaultConfig.satori)
  })
})

describe('OneBot 11 settings binding', () => {
  const validate = (value: unknown) => (OB11Schema['~standard'].validate(value) as { issues?: unknown[] }).issues ?? []
  const ws = { type: 'ws', enable: true, host: '127.0.0.1', port: 3001, heartInterval: 60000, token: '', reportSelfMessage: false, reportOfflineMessage: false, messageFormat: 'array', debug: false }

  it('has schema defaults equal to defaultConfig.ts', () => {
    expect(new OB11Schema()).toEqual(defaultConfig.ob11)
  })

  it('accepts the rows default_config.json writes into a new account file', () => {
    expect(validate(defaultConfigFile.ob11)).toEqual([])
  })

  it('accepts the shape the desktop app writes: every field on every row, null name and filter', () => {
    const reverse = { ...ws, type: 'ws-reverse', url: 'ws://127.0.0.1:8080', name: null, filter: null }
    expect(validate({ enable: true, connect: [reverse] })).toEqual([])
  })

  it('accepts an old migrated ws row without a host', () => {
    const { host: _host, ...legacy } = ws
    expect(validate({ enable: true, connect: [legacy] })).toEqual([])
  })

  it('refuses an unknown connection type and an out-of-range port', () => {
    expect(validate({ enable: true, connect: [{ ...ws, type: 'tcp' }] }).length).toBeGreaterThan(0)
    expect(validate({ enable: true, connect: [{ ...ws, port: 70000 }] }).length).toBeGreaterThan(0)
  })

  it('points the token rule at the offending row', () => {
    const value = { enable: true, connect: [ws, { ...ws, host: '' }] }
    expect(ob11Binding.check!(value as never)).toEqual([
      { path: ['connect', '1', 'token'], message: 'OneBot11 WebSocket 适配器监听全部地址时必须设置 Token' },
    ])
  })
})
