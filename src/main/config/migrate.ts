import { existsSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { Dict } from 'cosmokit'
import { DATA_DIR } from '@/common/globalVars'
import { configPaths, LEGACY_ACCOUNT_FILE } from '@/common/configPaths'
import { JsonFile } from '@/common/jsonFile'

/** Kept per account; every other key, including ones this version does not know, is instance-wide. */
export const ACCOUNT_KEYS: readonly string[] = ['ob11', 'satori', 'milky', 'webui']

export function splitConfig(config: Dict): { instance: Dict; account: Dict } {
  const instance: Dict = {}
  const account: Dict = {}
  for (const [key, value] of Object.entries(config)) {
    if (ACCOUNT_KEYS.includes(key)) account[key] = value
    else instance[key] = value
  }
  return { instance, account }
}

interface MigrationLog {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

function writeJson(file: string, value: Dict) {
  new JsonFile<Dict>(file, { defaultValue: () => ({}) }).writeSync(value)
}

/**
 * One-time move of the files the bot used before data/config/ (config-storage §9 steps 5 and 6). Each
 * data/config_<uin>.json is split into config/accounts/<uin>/settings.json (the account keys) and, if there
 * is none yet, config/global/settings.json (the rest, taken from the most recently used account's file),
 * then renamed to *.bak so nothing is lost.
 *
 * An old file that shows up again once its account has been migrated is reported and left alone: whatever
 * wrote it does not know the new layout -- an old desktop app recreates it with its own defaults -- and
 * importing it could overwrite the real settings.
 */
export function migrateLegacyConfig(log: MigrationLog) {
  let names: string[]
  try {
    names = readdirSync(DATA_DIR)
  } catch {
    return
  }
  const legacy = names
    .map(name => ({ name, uin: LEGACY_ACCOUNT_FILE.exec(name)?.[1] }))
    .filter((item): item is { name: string; uin: string } => !!item.uin)
    .map(({ name, uin }) => {
      const file = path.join(DATA_DIR, name)
      return { file, uin, mtimeMs: statSync(file).mtimeMs }
    })
    // Newest first: the instance-wide settings come from the account used last
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  let globalSeeded = existsSync(configPaths.globalSettings())
  for (const { file, uin } of legacy) {
    const target = configPaths.accountSettings(uin)
    if (existsSync(target)) {
      log.warn(`${path.basename(file)} 已不再读取（配置已迁到 ${path.relative(DATA_DIR, target)}），它的内容不会生效；可能是没升级的桌面端写的`)
      continue
    }
    let raw: Dict
    try {
      raw = JSON5.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      log.warn(`${path.basename(file)} 解析失败，没有迁移，原样留着：${(e as Error).message}`)
      continue
    }
    const { instance, account } = splitConfig(raw)
    if (!globalSeeded) {
      writeJson(configPaths.globalSettings(), instance)
      globalSeeded = true
    }
    writeJson(target, account)
    renameSync(file, `${file}.bak`)
    log.info(`已迁移 ${path.basename(file)} -> ${path.relative(DATA_DIR, target)}（原文件改名为 ${path.basename(file)}.bak）`)
  }

  migrateLegacyEmail(log)
}

/** email_config.json -> config/global/email.json, same one-time move and *.bak rename. */
function migrateLegacyEmail(log: MigrationLog) {
  const legacy = configPaths.legacyEmail()
  const target = configPaths.email()
  if (!existsSync(legacy)) return
  if (existsSync(target)) {
    log.warn(`${path.basename(legacy)} 已不再读取（邮件配置已迁到 ${path.relative(DATA_DIR, target)}），它的内容不会生效`)
    return
  }
  try {
    writeJson(target, JSON5.parse(readFileSync(legacy, 'utf8')))
  } catch (e) {
    log.warn(`${path.basename(legacy)} 解析失败，没有迁移，原样留着：${(e as Error).message}`)
    return
  }
  renameSync(legacy, `${legacy}.bak`)
  log.info(`已迁移 ${path.basename(legacy)} -> ${path.relative(DATA_DIR, target)}（原文件改名为 ${path.basename(legacy)}.bak）`)
}
