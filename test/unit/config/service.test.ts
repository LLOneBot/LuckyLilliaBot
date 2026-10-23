import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

beforeEach(() => {
  delete process.env.LLBOT_WEBUI_PORT
  delete process.env.LLBOT_LOG_LEVEL
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
