import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-migrate-'))

vi.mock('@/common/globalVars', () => ({ DATA_DIR }))

const { migrateLegacyConfig, splitConfig } = await import('@/main/config/migrate')
const { configPaths } = await import('@/common/configPaths')

const log = { info: () => {}, warn: vi.fn() }
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const legacyAccount = (uin: string) => path.join(DATA_DIR, `config_${uin}.json`)

function writeLegacy(uin: string, config: object, mtime?: Date) {
  writeFileSync(legacyAccount(uin), JSON.stringify(config))
  if (mtime) utimesSync(legacyAccount(uin), mtime, mtime)
}

afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }))

beforeEach(() => {
  for (const name of ['config', 'config_1.json', 'config_1.json.bak', 'config_2.json', 'config_2.json.bak', 'email_config.json', 'email_config.json.bak']) {
    rmSync(path.join(DATA_DIR, name), { recursive: true, force: true })
  }
  log.warn.mockClear()
})

describe('splitConfig', () => {
  it('keeps ob11/satori/milky/webui per account and everything else instance-wide', () => {
    const { instance, account } = splitConfig({ ob11: 1, satori: 2, milky: 3, webui: 4, log: true, ffmpeg: 'x', unknownKey: 5 })
    expect(account).toEqual({ ob11: 1, satori: 2, milky: 3, webui: 4 })
    expect(instance).toEqual({ log: true, ffmpeg: 'x', unknownKey: 5 })
  })
})

describe('migrateLegacyConfig', () => {
  it('splits a legacy file into the two settings files and renames it to .bak', () => {
    writeLegacy('1', { ob11: { enable: true }, webui: { port: 3080 }, log: false, ffmpeg: '/f' })

    migrateLegacyConfig(log)

    expect(read(configPaths.accountSettings('1'))).toEqual({ ob11: { enable: true }, webui: { port: 3080 } })
    expect(read(configPaths.globalSettings())).toEqual({ log: false, ffmpeg: '/f' })
    expect(existsSync(legacyAccount('1'))).toBe(false)
    expect(existsSync(`${legacyAccount('1')}.bak`)).toBe(true)
  })

  it('seeds the instance settings from the account used most recently', () => {
    writeLegacy('1', { webui: { port: 1 }, ffmpeg: '/old' }, new Date(Date.now() - 60_000))
    writeLegacy('2', { webui: { port: 2 }, ffmpeg: '/new' }, new Date())

    migrateLegacyConfig(log)

    expect(read(configPaths.globalSettings()).ffmpeg).toBe('/new')
    expect(read(configPaths.accountSettings('1')).webui.port).toBe(1)
    expect(read(configPaths.accountSettings('2')).webui.port).toBe(2)
  })

  it('moves email_config.json to config/global/email.json', () => {
    writeFileSync(path.join(DATA_DIR, 'email_config.json'), JSON.stringify({ enabled: true, from: 'a@b.c' }))
    migrateLegacyConfig(log)
    expect(read(configPaths.email())).toEqual({ enabled: true, from: 'a@b.c' })
    expect(existsSync(path.join(DATA_DIR, 'email_config.json'))).toBe(false)
    expect(existsSync(path.join(DATA_DIR, 'email_config.json.bak'))).toBe(true)
  })

  it('leaves a legacy file that reappears after migration, and warns', () => {
    mkdirSync(path.dirname(configPaths.accountSettings('1')), { recursive: true })
    writeFileSync(configPaths.accountSettings('1'), JSON.stringify({ webui: { port: 9 } }))
    writeLegacy('1', { webui: { port: 1 } }) // an un-upgraded desktop app recreated it

    migrateLegacyConfig(log)

    expect(read(configPaths.accountSettings('1')).webui.port).toBe(9) // the real settings win
    expect(existsSync(legacyAccount('1'))).toBe(true) // not touched
    expect(log.warn).toHaveBeenCalled()
  })

  it('does nothing when there is no legacy file', () => {
    migrateLegacyConfig(log)
    expect(existsSync(configPaths.globalSettings())).toBe(false)
    expect(log.warn).not.toHaveBeenCalled()
  })
})
