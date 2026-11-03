import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import defaultConfigFile from '@/main/config/default_config.json'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-config-'))
// No --instance in the test argv: the default instance
const settingsFile = path.join(DATA_DIR, 'instances', 'default', 'settings.json')

// Overrides the shared setup mock so the service works in a throwaway directory
vi.mock('@/common/globalVars', () => ({
  DATA_DIR,
  TEMP_DIR: path.join(DATA_DIR, 'temp'),
  LOG_DIR: path.join(DATA_DIR, 'logs'),
  dbDir: path.join(DATA_DIR, 'database'),
  STATE_DIR: path.join(DATA_DIR, 'state'),
  getFixedDataDir: () => DATA_DIR,
}))

// the shared setup mocks this module for other suites; here we want the real service
vi.mock('@/main/config', async importOriginal => await importOriginal<object>())

const ConfigService = (await import('@/main/config')).default

const read = () => (existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {})
const write = (value: unknown) => {
  mkdirSync(path.dirname(settingsFile), { recursive: true })
  writeFileSync(settingsFile, JSON.stringify(value))
}

let ctx: Context

async function boot() {
  ctx = new Context()
  await ctx.plugin(ConfigService)
  ctx.config.get() // creates the file from the template for a new instance
  return ctx.config
}

beforeEach(() => {
  delete process.env.LLBOT_WEBUI_PORT
  delete process.env.LLBOT_LOG_LEVEL
  rmSync(path.join(DATA_DIR, 'instances'), { recursive: true, force: true })
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
    expect(saved).toHaveProperty('musicCardSignUrl')
  })

  it('merges nested objects per key but replaces arrays whole', async () => {
    const config = await boot()
    config.patch({ extra: { list: [1, 2], keep: true } })
    config.patch({ extra: { list: [3] } })
    config.patch({ webui: { port: 4000 } })

    const saved = read()
    expect(saved.extra).toEqual({ list: [3], keep: true }) // the untouched sibling survived
    expect(saved.webui.port).toBe(4000)
    expect(saved.webui).toHaveProperty('host')
  })
})

describe('the instance settings file', () => {
  it('holds every setting in one file', async () => {
    const config = await boot()
    config.patch({ ffmpeg: '/usr/bin/ffmpeg', webui: { port: 4100 } })
    expect(read()).toMatchObject({ ffmpeg: '/usr/bin/ffmpeg', webui: { port: 4100 } })
    expect(config.file).toBe(settingsFile)
  })

  it('stays the same whichever account logs in', async () => {
    const config = await boot()
    config.patch({ webui: { port: 4100 } })
    // The settings are the instance's: another account logging in changes nothing
    ctx.provide('account', { uin: '777', uid: 'u_777', nick: 'other', online: true })
    expect(config.get(false).webui.port).toBe(4100)
    expect(config.file).toBe(settingsFile)
  })

  it('starts a new instance from default_config.json, minus the adapters, which have their plugin entries', async () => {
    const config = await boot()
    expect(config.get().webui).toEqual(defaultConfigFile.webui)
    expect(read()).not.toHaveProperty('ob11')
    expect(read()).not.toHaveProperty('satori')
    expect(read()).not.toHaveProperty('milky')
  })
})

describe('settings written by an older version', () => {
  it('renames musicSignUrl, swaps the retired sign host, and drops the settings nothing reads any more', async () => {
    write({ musicSignUrl: 'https://llob.linyuchen.net/sign/music', autoDeleteFile: true, autoDeleteFileSecond: 30, enableLocalFile2Url: true })
    const config = await boot()
    expect(config.get().musicCardSignUrl).toBe(defaultConfigFile.musicCardSignUrl)
    expect(read()).not.toHaveProperty('musicSignUrl')
    expect(read()).not.toHaveProperty('autoDeleteFile')
    expect(read()).not.toHaveProperty('autoDeleteFileSecond')
    expect(read()).not.toHaveProperty('enableLocalFile2Url')
  })

  it('keeps a custom music card service under the new name', async () => {
    write({ musicSignUrl: 'https://sign.example/card' })
    const config = await boot()
    expect(config.get().musicCardSignUrl).toBe('https://sign.example/card')
  })

  it('moves a music card service out of cardMsgSignUrl, a setting since dropped', async () => {
    write({ cardMsgSignUrl: 'https://ss.xingzhige.com/music_card/card' })
    const config = await boot()
    expect(config.get().musicCardSignUrl).toBe('https://ss.xingzhige.com/music_card/card')
    expect(read()).not.toHaveProperty('cardMsgSignUrl')
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
      { path: 'webui.port', by: 'LLBOT_WEBUI_PORT' },
      { path: 'logLevel', by: 'LLBOT_LOG_LEVEL' },
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

  it('keeps an external edit of a locked field when a reload has to write the file back', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    const config = await boot()
    const settings = read()
    settings.webui.port = 5555
    delete settings.webui.host // a missing default forces the reload to write the file back
    write(settings)

    config.get(false)

    expect(read().webui.port).toBe(5555)
    expect(read().webui.host).toBeDefined()
    expect(config.get().webui.port).toBe(9999)
  })
})

describe('--webui-port', () => {
  const realArgv = process.argv
  afterEach(() => {
    process.argv = realArgv
  })
  const launch = (...args: string[]) => {
    process.argv = ['node', 'main.ts', ...args]
  }

  it('takes the port in either form, over the file, without writing it', async () => {
    for (const args of [['--webui-port', '4321'], ['--webui-port=4321']]) {
      rmSync(path.join(DATA_DIR, 'instances'), { recursive: true, force: true })
      launch(...args)
      const config = await boot()
      expect(config.get(false).webui.port).toBe(4321)
      expect(read().webui.port).not.toBe(4321)
      expect(config.envLocks()).toContainEqual({ path: 'webui.port', by: '--webui-port' })
    }
  })

  it('wins over LLBOT_WEBUI_PORT, and a patch cannot move it', async () => {
    process.env.LLBOT_WEBUI_PORT = '9999'
    launch('--webui-port', '4321')
    const config = await boot()
    config.patch({ webui: { port: 1234 } })
    expect(config.get().webui.port).toBe(4321)
    expect(config.envLocks()).toContainEqual({ path: 'webui.port', by: '--webui-port' })
  })

  it('is ignored when it is not a port, leaving the variable or the file in charge', async () => {
    for (const args of [['--webui-port', 'abc'], ['--webui-port=70000'], ['--webui-port', '--dev']]) {
      rmSync(path.join(DATA_DIR, 'instances'), { recursive: true, force: true })
      process.env.LLBOT_WEBUI_PORT = '9999'
      launch(...args)
      const config = await boot()
      expect(config.get(false).webui.port).toBe(9999)
      expect(config.envLocks()).toContainEqual({ path: 'webui.port', by: 'LLBOT_WEBUI_PORT' })
    }
    delete process.env.LLBOT_WEBUI_PORT
    launch('--webui-port', 'abc')
    const config = await boot()
    expect(config.get(false).webui.port).toBe(read().webui.port)
    expect(config.envLockedPaths()).not.toContain('webui.port')
  })
})

describe('a config file that will not parse', () => {
  it('keeps the last good config instead of broadcasting the defaults', async () => {
    const config = await boot()
    config.patch({ webui: { port: 4242 } })
    expect(config.get(false).webui.port).toBe(4242)

    writeFileSync(settingsFile, '{ this is not json')

    expect(config.get(false).webui.port).toBe(4242)
    // and the broken file is left for the user to fix, not overwritten
    expect(readFileSync(settingsFile, 'utf8')).toBe('{ this is not json')
  })

  it('runs on the template without touching the file when there is no good config yet', async () => {
    write({ webui: { port: 1 } })
    writeFileSync(settingsFile, '{ broken')
    ctx = new Context()
    await ctx.plugin(ConfigService)
    expect(ctx.config.get().webui.port).toBe(defaultConfigFile.webui.port)
    expect(readFileSync(settingsFile, 'utf8')).toBe('{ broken')
  })
})
