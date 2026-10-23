import { Context, Service } from 'cordis'
import { describe, expect, it } from 'vitest'
import { Config as LLBotConfig } from '@/common/types'
import { deepMerge } from '@/common/utils/misc'
import { defaultConfig } from '@/main/config/defaultConfig'
import { SatoriSchema, satoriBinding } from '@/main/builtinConfig/satori'

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
