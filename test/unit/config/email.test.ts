import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context, Fiber } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-email-'))
const pluginsFile = path.join(DATA_DIR, 'plugins.json')
const NAME = 'builtin:email-notification'

vi.mock('@/common/globalVars', () => ({
  DATA_DIR,
}))

const { checkEmail, DEFAULT_EMAIL_CONFIG, EmailSchema } = await import('@/plugin/internal/tool/email-notification/config')
const { emailSettings } = await import('@/plugin/internal/tool/email-notification/settings')
const { default: PluginService, PluginConfigError, SECRET_MASK } = await import('@/plugin/host')

const { enabled: _enabled, ...blank } = DEFAULT_EMAIL_CONFIG
const usable = {
  smtp: { host: 'smtp.test.com', port: 465, secure: true, auth: { user: 'me@test.com', pass: 'real-pass' } },
  from: 'bot@test.com',
  to: 'me@test.com',
}

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

describe('email settings', () => {
  it('has schema defaults equal to the defaults the service has always used', () => {
    expect(new EmailSchema()).toEqual(blank)
  })

  it('only insists on a usable SMTP setup when asked to: while notifications are on, or for a test email', () => {
    expect(checkEmail(blank, false)).toEqual([])
    expect(checkEmail(blank, true).map(issue => issue.path.join('.'))).toEqual(['smtp.host', 'from', 'to'])
    expect(checkEmail(usable, true)).toEqual([])
  })
})

describe('builtin:email-notification through the plugin API', () => {
  let ctx: Context
  let service: Fiber | undefined
  let id: string

  const entry = () => JSON.parse(readFileSync(pluginsFile, 'utf8')).entries.find((item: { name: string }) => item.name === NAME)
  const effective = () => ctx.plugins.builtinSettings(NAME)!.config as typeof usable

  async function boot(stored?: { config?: unknown; disabled?: boolean }) {
    if (stored) writeFileSync(pluginsFile, JSON.stringify({ version: 1, entries: [{ id: 'e0000001', name: NAME, ...stored }] }))
    ctx = new Context()
    await ctx.plugin(TimerService)
    service = await ctx.plugin(PluginService, {
      file: pluginsFile,
      roots: [],
      resolver: false,
      builtins: [{ name: NAME, title: '邮件通知', manifest: {}, plugin: { name: 'email', Config: EmailSchema, apply() {} }, config: emailSettings }],
    })
    id = ctx.plugins.list()[0].id
  }

  afterEach(async () => {
    await service?.dispose()
    rmSync(pluginsFile, { force: true })
  })

  it('starts switched off as a new entry', async () => {
    await boot()
    expect(ctx.plugins.get(id)).toMatchObject({ disabled: true })
    expect(entry()).toMatchObject({ disabled: true })
  })

  describe('with usable settings', () => {
    beforeEach(() => boot({ config: usable, disabled: true }))

    it('describes them with the password masked', async () => {
      const description = await ctx.plugins.describe(id)
      expect(description).toMatchObject({ secrets: ['smtp.auth.pass'] })
      expect((description.effective as typeof usable).smtp.auth.pass).toBe(SECRET_MASK)
      expect((description.config as typeof usable).smtp.auth.pass).toBe(SECRET_MASK)
    })

    it('keeps the password when the form sends it back masked, and clears it only on request', async () => {
      const form = { ...usable, smtp: { ...usable.smtp, port: 587, auth: { user: 'me@test.com', pass: SECRET_MASK } } }
      await ctx.plugins.updateConfig(id, form)
      expect(effective().smtp).toMatchObject({ port: 587, auth: { pass: 'real-pass' } })
      await ctx.plugins.updateConfig(id, { ...form, smtp: { ...form.smtp, auth: { user: 'me@test.com', pass: '' } } }, undefined, ['smtp.auth.pass'])
      expect(effective().smtp.auth.pass).toBe('')
    })

    it('can be saved blank while off, and switched on before SMTP is set up (it just will not send)', async () => {
      await ctx.plugins.updateConfig(id, structuredClone(blank))
      expect(effective().from).toBe('')
      await ctx.plugins.enable(id)
      expect(entry().disabled).toBeUndefined()
    })

    it('refuses saving a config with no SMTP while it is on', async () => {
      await ctx.plugins.enable(id)
      await expect(ctx.plugins.updateConfig(id, structuredClone(blank))).rejects.toBeInstanceOf(PluginConfigError)
      expect(effective().smtp.host).toBe('smtp.test.com')
    })

    it('turns notifications on and off with the entry switch', async () => {
      expect(await ctx.plugins.enable(id)).toMatchObject({ disabled: false })
      expect(entry().disabled).toBeUndefined()
      expect(await ctx.plugins.disable(id)).toMatchObject({ disabled: true, state: 'disposed' })
      expect(entry().disabled).toBe(true)
    })
  })
})
