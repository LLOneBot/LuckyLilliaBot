import { describe, expect, it, vi } from 'vitest'
import { Context } from 'cordis'
import { applyLegacyConfig, legacyConfig } from '@/main/config/legacyConfig'

function fakeContext(entries: Record<string, { id: string; enabled: boolean; config: object }>) {
  const plugins = {
    builtinSettings: (name: string) => entries[name],
    updateConfig: vi.fn(async () => {}),
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
  }
  const ctx = {
    config: { get: () => ({ log: true, cardMsgSignUrl: 'https://sign.example' }), patch: vi.fn((partial: object) => partial) },
    get: (name: string) => (name === 'plugins' ? plugins : undefined),
    parallel: vi.fn(async () => {}),
    logger: { warn: vi.fn() },
  } as unknown as Context
  return { ctx, plugins }
}

describe('the old config shape', () => {
  it('puts each adapter\'s section back, its switch as `enable`', () => {
    const { ctx } = fakeContext({
      'builtin:satori': { id: 's', enabled: true, config: { port: 5600 } },
      'builtin:milky': { id: 'm', enabled: false, config: { reportSelfMessage: true } },
    })
    expect(legacyConfig(ctx)).toEqual({
      log: true,
      cardMsgSignUrl: 'https://sign.example',
      // the old name too, for clients that know only that one
      musicSignUrl: 'https://sign.example',
      satori: { port: 5600, enable: true },
      milky: { reportSelfMessage: true, enable: false },
    })
  })

  it('passes the choice to skip the adapters\' own rules on, as OneBot set_config needs', async () => {
    const { ctx, plugins } = fakeContext({ 'builtin:satori': { id: 's', enabled: false, config: { host: '127.0.0.1' } } })
    await applyLegacyConfig(ctx, { satori: { enable: true, host: '' } }, { rules: false })
    expect(plugins.updateConfig).toHaveBeenCalledWith('s', { host: '' }, undefined, [], { rules: false })
    expect(plugins.enable).toHaveBeenCalledWith('s', { rules: false })
    // nothing left over for the settings file
    expect(ctx.config.patch).not.toHaveBeenCalled()
  })

  it('takes the old name of the sign address and drops settings nothing reads any more', async () => {
    const { ctx } = fakeContext({})
    await applyLegacyConfig(ctx, { musicSignUrl: 'https://sign.example/card', autoDeleteFile: true, log: false })
    expect(ctx.config.patch).toHaveBeenCalledWith({ cardMsgSignUrl: 'https://sign.example/card', log: false })
  })
})
