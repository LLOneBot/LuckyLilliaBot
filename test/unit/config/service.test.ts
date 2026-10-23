import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-config-'))
const UIN = '123456'
const configPath = path.join(DATA_DIR, `config_${UIN}.json`)

// Overrides the shared setup mock so the service works in a throwaway directory
vi.mock('@/common/globalVars', () => ({
  DATA_DIR,
  TEMP_DIR: path.join(DATA_DIR, 'temp'),
  LOG_DIR: path.join(DATA_DIR, 'logs'),
  dbDir: path.join(DATA_DIR, 'database'),
  CONFIG_DIR: path.join(DATA_DIR, 'config'),
  STATE_DIR: path.join(DATA_DIR, 'state'),
  GLOBAL_PLUGINS_FILE: path.join(DATA_DIR, 'config', 'global', 'plugins.json'),
  ACCOUNTS_CONFIG_DIR: path.join(DATA_DIR, 'config', 'accounts'),
  accountPluginsFile: (uin: string) => path.join(DATA_DIR, 'config', 'accounts', uin, 'plugins.json'),
  selfInfo: { uid: 'u', uin: UIN, nick: 'n', online: true },
  getFixedDataDir: () => DATA_DIR,
}))

// the shared setup mocks this module for other suites; here we want the real service
vi.mock('@/main/config', async importOriginal => await importOriginal<object>())

const ConfigService = (await import('@/main/config')).default

const read = () => JSON.parse(readFileSync(configPath, 'utf8'))

let ctx: Context

async function boot() {
  ctx = new Context()
  await ctx.plugin(ConfigService)
  ctx.config.get(false) // resolve the path for this uin and create the file from defaults
  return ctx.config
}

const { selfInfo } = await import('@/common/globalVars')

beforeEach(() => {
  delete process.env.LLBOT_WEBUI_PORT
  delete process.env.LLBOT_LOG_LEVEL
  // every case starts from a fresh file; one of them leaves it unparsable
  rmSync(configPath, { force: true })
})

afterEach(() => {
  delete process.env.LLBOT_WEBUI_PORT
  delete process.env.LLBOT_LOG_LEVEL
})

describe('ConfigService.patch', () => {
  it('leaves the fields it was not given alone', async () => {
    const config = await boot()
    config.patch({ ffmpeg: '/usr/bin/ffmpeg' })

    const saved = read()
    expect(saved.ffmpeg).toBe('/usr/bin/ffmpeg')
    // a full overwrite (the old set_config behaviour) would have dropped these
    expect(saved.webui).toBeTruthy()
    expect(saved.ob11).toBeTruthy()
    expect(saved.musicSignUrl).toBeTruthy()
  })

  it('merges nested objects per key but replaces arrays whole', async () => {
    const config = await boot()
    config.patch({ ob11: { connect: [{ type: 'ws', enable: true, port: 7000 }] } })
    config.patch({ webui: { port: 4000 } })

    const saved = read()
    expect(saved.ob11.connect).toEqual([{ type: 'ws', enable: true, port: 7000 }])
    expect(saved.ob11).toHaveProperty('enable') // untouched sibling survived
    expect(saved.webui.port).toBe(4000)
    expect(saved.webui).toHaveProperty('host')
  })
})

describe('LLBOT_* overrides', () => {
  it('shows up in get() but never reaches the file', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()

    expect(config.get(false).webui.port).toBe(9999)
    expect(read().webui.port).not.toBe(9999)
    expect(config.envLockedPaths()).toContain('webui.port')
  })

  it('does not get frozen into the file when another field is saved', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()
    const onDiskPort = read().webui.port

    config.patch({ ffmpeg: '/x' })

    const saved = read()
    expect(saved.ffmpeg).toBe('/x')
    expect(saved.webui.port).toBe(onDiskPort)
  })

  it('ignores a value the field cannot take', async () => {
    process.env.LLBOT_LOG_LEVEL = 'nonsense'
    const config = await boot()
    expect(config.get(false).logLevel).toBe('info')
    expect(config.envLockedPaths()).not.toContain('logLevel')
  })

  it('names the variable behind each locked field', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    process.env.LLBOT_LOG_LEVEL = 'debug'
    const config = await boot()
    expect(config.envLocks()).toEqual(expect.arrayContaining([
      { path: 'webui.port', env: 'LLBOT_WEBUI_PORT' },
      { path: 'logLevel', env: 'LLBOT_LOG_LEVEL' },
    ]))
  })

  it('wins over a patch that tries to change the locked field', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()
    const onDiskPort = read().webui.port

    config.patch({ webui: { port: 1234 }, ffmpeg: '/y' })

    // memory keeps the variable's value, the file keeps its own, the rest of the patch lands
    expect(config.get().webui.port).toBe(9999)
    expect(read().webui.port).toBe(onDiskPort)
    expect(read().ffmpeg).toBe('/y')
  })

  it('applies before login too, when there is no account file yet', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    selfInfo.uin = ''
    try {
      ctx = new Context()
      await ctx.plugin(ConfigService)
      expect(ctx.config.get(false).webui.port).toBe(9999)
      expect(existsSync(configPath)).toBe(false)
    } finally {
      selfInfo.uin = UIN
    }
  })

  it('keeps an external edit of a locked field when a reload has to write the file back', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()
    const edited = read()
    edited.webui.port = 5555
    delete edited.msgCacheExpire // forces the reload to fill a default and write the file back
    writeFileSync(configPath, JSON.stringify(edited))

    config.get(false)

    expect(read().webui.port).toBe(5555)
    expect(read().msgCacheExpire).toBeDefined()
    expect(config.get().webui.port).toBe(9999)
  })
})

describe('ConfigService.peek', () => {
  it('reads another account without creating its file or switching the current config', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()
    const before = config.get()
    const other = path.join(DATA_DIR, 'config_777.json')

    const peeked = config.peek('777')

    expect(existsSync(other)).toBe(false)
    expect(peeked.webui.port).toBe(9999)
    expect(config.get()).toBe(before)
  })

  it('reflects what is on disk for an existing account file', async () => {
    const config = await boot()
    const other = path.join(DATA_DIR, 'config_778.json')
    writeFileSync(other, JSON.stringify({ webui: { enable: false, host: '0.0.0.0', port: 4321 } }))

    expect(config.peek('778').webui).toEqual({ enable: false, host: '0.0.0.0', port: 4321 })
    // and leaves that file exactly as it was (no fill-in write)
    expect(JSON.parse(readFileSync(other, 'utf8'))).toEqual({ webui: { enable: false, host: '0.0.0.0', port: 4321 } })
  })
})

describe('a config file that will not parse', () => {
  it('keeps the last good config instead of broadcasting the defaults', async () => {
    const config = await boot()
    config.patch({ ffmpeg: '/keep/me' })
    expect(config.get(false).ffmpeg).toBe('/keep/me')

    writeFileSync(configPath, '{ this is not json')

    expect(config.get(false).ffmpeg).toBe('/keep/me')
    // and the broken file is left for the user to fix, not overwritten
    expect(readFileSync(configPath, 'utf8')).toBe('{ this is not json')
  })
})
