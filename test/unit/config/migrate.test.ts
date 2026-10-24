import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-migrate-'))

vi.mock('@/common/globalVars', () => ({ DATA_DIR }))

const { migrateToInstances } = await import('@/main/config/migrate')

const log = { info: vi.fn(), warn: vi.fn() }
const at = (...parts: string[]) => path.join(DATA_DIR, ...parts)
const read = (...parts: string[]) => JSON.parse(readFileSync(at(...parts), 'utf8'))
const instances = () => readdirSync(at('instances')).sort()

function put(file: string, content: unknown, mtime?: Date) {
  mkdirSync(path.dirname(at(file)), { recursive: true })
  writeFileSync(at(file), typeof content === 'string' ? content : JSON.stringify(content))
  if (mtime) utimesSync(at(file), mtime, mtime)
}

const older = new Date('2026-01-01')
const newer = new Date('2026-06-01')

afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }))

beforeEach(() => {
  for (const name of readdirSync(DATA_DIR)) rmSync(at(name), { recursive: true, force: true })
  log.info.mockClear()
  log.warn.mockClear()
})

describe('migrateToInstances', () => {
  it('leaves a fresh data directory alone', () => {
    migrateToInstances(log)
    expect(existsSync(at('instances'))).toBe(false)
  })

  it('makes the only account the default instance and keeps the old file as .bak', () => {
    put('config_1.json', { webui: { port: 3080 }, ffmpeg: '/f' })
    migrateToInstances(log)
    expect(instances()).toEqual(['default'])
    expect(read('instances', 'default', 'settings.json')).toEqual({ webui: { port: 3080 }, ffmpeg: '/f' })
    expect(existsSync(at('config_1.json'))).toBe(false)
    expect(existsSync(at('config_1.json.bak'))).toBe(true)
  })

  it('puts accounts with the same settings in one instance', () => {
    put('config_1.json', { ffmpeg: '/f' }, older)
    put('config_2.json', { ffmpeg: '/f' }, newer)
    migrateToInstances(log)
    expect(instances()).toEqual(['default'])
    expect(existsSync(at('config_1.json.bak'))).toBe(true)
  })

  it('gives an account whose settings differ an instance named after it', () => {
    put('config_1.json', { webui: { port: 3001 } }, older)
    put('config_2.json', { webui: { port: 3002 } }, newer)
    migrateToInstances(log)
    expect(instances()).toEqual(['1', 'default'])
    // the account used most recently is the default
    expect(read('instances', 'default', 'settings.json').webui.port).toBe(3002)
    expect(read('instances', '1', 'settings.json').webui.port).toBe(3001)
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('--instance 1'))
  })

  it('gives every instance its own copy of the email settings, the WebUI password and the plugin entries', () => {
    put('config_1.json', { webui: { port: 3001 } }, older)
    put('config_2.json', { webui: { port: 3002 } }, newer)
    put('email_config.json', { enabled: true, from: 'a@b.c' })
    put('webui_token.txt', 'secret')
    put('config/global/plugins.json', { version: 1, entries: [{ id: 'a1', name: 'p' }] })
    migrateToInstances(log)
    for (const name of ['default', '1']) {
      expect(read('instances', name, 'email.json')).toEqual({ enabled: true, from: 'a@b.c' })
      expect(readFileSync(at('instances', name, 'webui_token.txt'), 'utf8')).toBe('secret')
      expect(read('instances', name, 'plugins.json').entries).toEqual([{ id: 'a1', name: 'p' }])
    }
    expect(existsSync(at('email_config.json.bak'))).toBe(true)
    expect(existsSync(at('webui_token.txt.bak'))).toBe(true)
  })

  it('puts the unreleased data/config/ layout back together, and retires it as a whole', () => {
    put('config/global/settings.json', { ffmpeg: '/f' })
    put('config/accounts/1/settings.json', { webui: { port: 3001 } })
    put('config/accounts/1/plugins.json', { version: 1, entries: {} })
    put('config/global/email.json', { enabled: false })
    put('plugin-data/p/shared/x.txt', 'data')
    migrateToInstances(log)
    expect(read('instances', 'default', 'settings.json')).toEqual({ ffmpeg: '/f', webui: { port: 3001 } })
    expect(read('instances', 'default', 'email.json')).toEqual({ enabled: false })
    expect(readFileSync(at('instances', 'default', 'plugin-data', 'p', 'shared', 'x.txt'), 'utf8')).toBe('data')
    expect(existsSync(at('config'))).toBe(false)
    expect(existsSync(at('config.bak', 'accounts', '1', 'plugins.json'))).toBe(true)
    // the per-account override has nowhere to go
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('覆盖'))
  })

  it('prefers the unreleased layout over an old file that came back for the same account', () => {
    put('config/accounts/1/settings.json', { webui: { port: 3001 } }, older)
    put('config_1.json', { webui: { port: 9999 } }, newer)
    migrateToInstances(log)
    expect(read('instances', 'default', 'settings.json').webui.port).toBe(3001)
    expect(existsSync(at('config_1.json.bak'))).toBe(true)
  })

  it('runs once: later old files are reported, not imported', () => {
    put('config_1.json', { webui: { port: 3001 } })
    migrateToInstances(log)
    put('config_1.json', { webui: { port: 9999 } })
    migrateToInstances(log)
    expect(read('instances', 'default', 'settings.json').webui.port).toBe(3001)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('config_1.json 已不再读取'))
  })

  it('leaves a file it cannot parse where it is', () => {
    put('config_1.json', '{ broken')
    put('config_2.json', { ffmpeg: '/f' })
    migrateToInstances(log)
    expect(read('instances', 'default', 'settings.json')).toEqual({ ffmpeg: '/f' })
    expect(readFileSync(at('config_1.json'), 'utf8')).toBe('{ broken')
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('config_1.json 解析失败'))
  })

  it('does not overwrite a backup an earlier migration left', () => {
    put('config_1.json.bak', { earlier: true })
    put('config_1.json', { ffmpeg: '/f' })
    migrateToInstances(log)
    expect(read('config_1.json.bak')).toEqual({ earlier: true })
    expect(read('config_1.json.bak.1')).toEqual({ ffmpeg: '/f' })
  })

  it('starts over when a previous run died halfway', () => {
    put('instances.migrating/default/settings.json', { half: true })
    put('config_1.json', { ffmpeg: '/f' })
    migrateToInstances(log)
    expect(read('instances', 'default', 'settings.json')).toEqual({ ffmpeg: '/f' })
    expect(existsSync(at('instances.migrating'))).toBe(false)
  })
})
