import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-email-'))
const file = path.join(DATA_DIR, 'email_config.json')

vi.mock('@/common/globalVars', () => ({
  DATA_DIR,
  selfInfo: { uid: 'u', uin: '123456', nick: 'n', online: true },
}))

const { checkEmail, DEFAULT_EMAIL_CONFIG, EmailConfigStore, EmailSchema } = await import('@/common/emailConfig')
const { emailBinding } = await import('@/main/builtinConfig/email')
const { default: PluginService, PluginConfigError, SECRET_MASK } = await import('@/plugin')

const read = () => JSON.parse(readFileSync(file, 'utf8'))

const usable = {
  enabled: false,
  smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'me@test.com', pass: 'real-pass' } },
  from: 'bot@test.com',
  to: 'me@test.com',
}

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('email settings', () => {
  it('has schema defaults equal to the defaults the service has always used', () => {
    expect(new EmailSchema()).toEqual(DEFAULT_EMAIL_CONFIG)
  })

  it('only insists on a usable SMTP setup while notifications are on, unless asked to', () => {
    const blank = structuredClone(DEFAULT_EMAIL_CONFIG)
    expect(checkEmail(blank)).toEqual([])
    expect(checkEmail({ ...blank, enabled: true }).map(issue => issue.path.join('.'))).toEqual(['smtp.host', 'from', 'to'])
    expect(checkEmail(blank, true)).toHaveLength(3)
    expect(checkEmail({ ...usable, enabled: true })).toEqual([])
  })
})

describe('EmailConfigStore', () => {
  let store: InstanceType<typeof EmailConfigStore>

  beforeEach(() => {
    rmSync(file, { force: true })
    store = new EmailConfigStore(file)
  })

  it('fills fields an older file or the desktop app left out', () => {
    writeFileSync(file, JSON.stringify({ enabled: true, smtp: { host: 'h' } }))
    expect(store.get()).toEqual({ ...DEFAULT_EMAIL_CONFIG, enabled: true, smtp: { ...DEFAULT_EMAIL_CONFIG.smtp, host: 'h' } })
  })

  it('keeps the last good value for an unparsable file and leaves the file alone', () => {
    store.save(usable)
    writeFileSync(file, '{ not json')
    expect(store.get()).toEqual(usable)
    expect(readFileSync(file, 'utf8')).toBe('{ not json')
  })

  it('creates the default file only when there is none', () => {
    store.ensure()
    expect(read()).toEqual(DEFAULT_EMAIL_CONFIG)
    store.save(usable)
    store.ensure()
    expect(read()).toEqual(usable)
  })

  it('reports an outside edit but not its own write', async () => {
    store.save(usable)
    const listener = vi.fn()
    const stop = store.watch(listener)
    try {
      store.save({ ...usable, to: 'other@test.com' })
      await new Promise(resolve => setTimeout(resolve, 1800))
      expect(listener).not.toHaveBeenCalled()
      writeFileSync(file, JSON.stringify({ ...usable, to: 'desktop@test.com' }))
      await vi.waitFor(() => expect(listener).toHaveBeenCalled(), { timeout: 4000, interval: 100 })
    } finally {
      stop()
    }
  }, 10_000)
})

describe('builtin:email-notification through the plugin API', () => {
  let ctx: Context
  let service: Fiber | undefined
  let id: string

  beforeEach(async () => {
    writeFileSync(file, JSON.stringify(usable))
    ctx = new Context()
    await ctx.plugin(TimerService)
    service = await ctx.plugin(PluginService, {
      file: path.join(DATA_DIR, 'plugins.json'),
      roots: [],
      resolver: false,
      builtins: [{ name: 'builtin:email-notification', title: '邮件通知', manifest: {}, plugin: { apply() {} }, config: emailBinding }],
    })
    id = ctx.plugins.list()[0].id
  })

  afterEach(async () => {
    await service?.dispose()
    rmSync(path.join(DATA_DIR, 'plugins.json'), { force: true })
  })

  it('describes email_config.json with the password masked', async () => {
    const description = await ctx.plugins.describe(id)
    expect(description).toMatchObject({ scope: 'global', fixedScope: true, location: 'email_config.json', secrets: ['smtp.auth.pass'] })
    expect((description.effective as typeof usable).smtp.auth.pass).toBe(SECRET_MASK)
  })

  it('keeps the password when the form sends it back masked, and clears it only on request', async () => {
    const form = { ...usable, smtp: { ...usable.smtp, port: 587, auth: { user: 'me@test.com', pass: SECRET_MASK } } }
    await ctx.plugins.updateConfig(id, form)
    expect(read().smtp).toMatchObject({ port: 587, auth: { pass: 'real-pass' } })
    await ctx.plugins.updateConfig(id, { ...form, smtp: { ...form.smtp, auth: { user: 'me@test.com', pass: '' } } }, undefined, undefined, ['smtp.auth.pass'])
    expect(read().smtp.auth.pass).toBe('')
  })

  it('still saves blanks while switched off, and refuses them once switched on', async () => {
    await ctx.plugins.updateConfig(id, structuredClone(DEFAULT_EMAIL_CONFIG))
    expect(read()).toMatchObject({ enabled: false, from: '' })
    await expect(ctx.plugins.enable(id)).rejects.toBeInstanceOf(PluginConfigError)
    expect(read().enabled).toBe(false)
  })

  it('turns notifications on and off from the plugin card', async () => {
    expect(await ctx.plugins.enable(id)).toMatchObject({ disabled: false })
    expect(read().enabled).toBe(true)
    expect(await ctx.plugins.disable(id)).toMatchObject({ disabled: true, state: 'disposed' })
    expect(read().enabled).toBe(false)
  })
})
