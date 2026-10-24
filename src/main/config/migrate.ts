import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { deepEqual, Dict } from 'cosmokit'
import { DATA_DIR } from '@/common/globalVars'
import { INSTANCE_FILES, LEGACY_ACCOUNT_FILE, legacyPaths } from '@/common/configPaths'
import { DEFAULT_INSTANCE, instancesDir } from '@/common/instance'
import { JsonFile } from '@/common/jsonFile'
import { mergeNewProperties } from '@/common/utils'
import { templateConfig, upgradeConfig } from './upgrade'

export interface MigrationLog {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

interface Found<T> {
  value: T
  mtimeMs: number
  /** Files (or the one directory) this came from, retired once the instances are in place. */
  sources: string[]
}

interface AccountConfig extends Found<Dict> {
  uin: string
}

/**
 * One-time move into data/instances/ (config-storage §9). Runs while there is no instances/ yet: the most
 * recently used account's settings become the default instance, and every other account whose settings differ
 * gets an instance named after its QQ number. The email settings, the WebUI password and the plugin entries
 * were shared by all accounts, so every instance gets a copy. The old files are renamed to *.bak.
 *
 * Built in instances.migrating/ and renamed into place at the end: a crash halfway leaves no instances/
 * behind, so the next start runs the whole migration again.
 */
export function migrateToInstances(log: MigrationLog) {
  if (existsSync(instancesDir())) {
    reportLeftovers(log)
    return
  }
  const accounts = findAccounts(log).sort((a, b) => b.mtimeMs - a.mtimeMs)
  const instanceWide = readJson(log, path.join(legacyPaths.configDir(), 'global', 'settings.json'))
  const email = newest(readJson(log, legacyPaths.email()), readJson(log, path.join(legacyPaths.configDir(), 'global', 'email.json')))
  const plugins = newest(readJson(log, legacyPaths.pluginsFile()), readJson(log, path.join(legacyPaths.configDir(), 'global', 'plugins.json')))
  const token = existsSync(legacyPaths.webuiToken()) ? legacyPaths.webuiToken() : undefined
  const pluginData = existsSync(legacyPaths.pluginData()) ? legacyPaths.pluginData() : undefined
  if (!accounts.length && !instanceWide && !email && !plugins && !token && !pluginData) return

  const baseline = accounts[0] ?? (instanceWide && { ...instanceWide, uin: '' })
  const instances: { name: string; settings?: Dict; from?: string }[] = [
    { name: DEFAULT_INSTANCE, settings: baseline?.value, from: accounts[0]?.uin },
  ]
  for (const account of accounts.slice(1)) {
    if (deepEqual(normalize(account.value), normalize(baseline!.value))) {
      log.info(`QQ ${account.uin} 的配置和最近使用的 QQ ${baseline!.uin} 相同，以后用实例 ${DEFAULT_INSTANCE}`)
    } else {
      instances.push({ name: account.uin, settings: account.value, from: account.uin })
    }
  }

  const staging = `${instancesDir()}.migrating`
  rmSync(staging, { recursive: true, force: true })
  for (const { name, settings } of instances) {
    const dir = path.join(staging, name)
    mkdirSync(dir, { recursive: true })
    if (settings) writeJson(path.join(dir, INSTANCE_FILES.settings), settings)
    if (email) writeJson(path.join(dir, INSTANCE_FILES.email), email.value)
    if (plugins) writeJson(path.join(dir, INSTANCE_FILES.plugins), plugins.value)
    if (token) copyFileSync(token, path.join(dir, INSTANCE_FILES.webuiToken))
  }
  if (pluginData) renameSync(pluginData, path.join(staging, DEFAULT_INSTANCE, INSTANCE_FILES.pluginData))
  renameSync(staging, instancesDir())

  const sources = new Set([
    ...accounts.flatMap(account => account.sources),
    ...(instanceWide?.sources ?? []),
    ...(email?.sources ?? []),
    ...(plugins?.sources ?? []),
    ...(token ? [token] : []),
  ])
  // The unreleased layout goes as a whole, whatever in it was not carried over (the per-account overrides)
  const configDir = legacyPaths.configDir()
  if (existsSync(configDir)) {
    for (const source of [...sources]) if (source.startsWith(configDir + path.sep)) sources.delete(source)
    sources.add(configDir)
  }
  for (const source of sources) retire(source)

  for (const { name, from } of instances) {
    const what = from ? `QQ ${from} 的配置` : '没有登录过的旧配置'
    log.info(`已把${what}迁到实例 ${name}（data/instances/${name}/）`)
    if (name !== DEFAULT_INSTANCE) log.info(`QQ ${name} 的配置和 ${DEFAULT_INSTANCE} 不同，单独放在实例 ${name}：用 -q ${name} 或 --instance ${name} 启动就会用它`)
  }
  log.info(`旧配置文件已改名为 *.bak：${[...sources].map(source => path.relative(DATA_DIR, source)).join('、')}`)
}

/**
 * Each account's complete settings, from the old per-account file or from the unreleased layout. An account in
 * both had its old file migrated already: one that is back was rewritten by something that does not know the
 * new layout (an old desktop app, with its own defaults), so the unreleased layout wins.
 */
function findAccounts(log: MigrationLog): AccountConfig[] {
  const byUin = new Map<string, AccountConfig>()

  for (const name of list(DATA_DIR)) {
    const uin = LEGACY_ACCOUNT_FILE.exec(name)?.[1]
    if (!uin) continue
    const found = readJson(log, legacyPaths.account(uin))
    if (found) byUin.set(uin, { ...found, uin })
  }

  const offer = (account: AccountConfig) => {
    const legacy = byUin.get(account.uin)
    byUin.set(account.uin, { ...account, sources: [...(legacy?.sources ?? []), ...account.sources] })
  }
  const accountsDir = path.join(legacyPaths.configDir(), 'accounts')
  const instanceWide = readJson(log, path.join(legacyPaths.configDir(), 'global', 'settings.json'))
  for (const uin of list(accountsDir)) {
    if (existsSync(path.join(accountsDir, uin, 'plugins.json'))) {
      log.warn(`QQ ${uin} 的插件账号覆盖配置（data/config/accounts/${uin}/plugins.json）不再支持，没有迁移`)
    }
    const found = readJson(log, path.join(accountsDir, uin, 'settings.json'))
    if (!found) continue
    // The instance-wide part was split off into config/global/; put the account back together
    offer({ uin, value: { ...instanceWide?.value, ...found.value }, mtimeMs: found.mtimeMs, sources: found.sources })
  }
  return [...byUin.values()]
}

/** What the bot would make of these settings, so two accounts compare equal when they would behave the same. */
function normalize(config: Dict): Dict {
  const upgraded = upgradeConfig(structuredClone(config))
  mergeNewProperties(templateConfig(), upgraded)
  delete (upgraded.webui as Dict | undefined)?.token
  return upgraded
}

function newest<T>(...found: (Found<T> | undefined)[]): Found<T> | undefined {
  const present = found.filter((item): item is Found<T> => !!item)
  if (!present.length) return
  const winner = present.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a))
  return { ...winner, sources: present.flatMap(item => item.sources) }
}

function readJson(log: MigrationLog, file: string): Found<Dict> | undefined {
  if (!existsSync(file)) return
  try {
    return { value: JSON5.parse(readFileSync(file, 'utf8')), mtimeMs: statSync(file).mtimeMs, sources: [file] }
  } catch (e) {
    log.warn(`${path.relative(DATA_DIR, file)} 解析失败，没有迁移，原样留着：${(e as Error).message}`)
  }
}

function writeJson(file: string, value: Dict) {
  new JsonFile<Dict>(file, { defaultValue: () => ({}) }).writeSync(value)
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Renames to *.bak, or *.bak.1, ... when an earlier migration already left a *.bak there. */
function retire(file: string) {
  let target = `${file}.bak`
  for (let n = 1; existsSync(target); n++) target = `${file}.bak.${n}`
  renameSync(file, target)
}

/**
 * Old files that showed up again after the migration: whatever wrote them, typically a desktop app that has
 * not been updated, does not know about instances, so their content is not used.
 */
function reportLeftovers(log: MigrationLog) {
  const leftovers = list(DATA_DIR)
    .filter(name => LEGACY_ACCOUNT_FILE.test(name))
    .map(name => path.join(DATA_DIR, name))
  for (const file of [legacyPaths.email(), legacyPaths.webuiToken(), legacyPaths.configDir()]) {
    if (existsSync(file)) leftovers.push(file)
  }
  for (const file of leftovers) {
    log.warn(`${path.relative(DATA_DIR, file)} 已不再读取（配置都在 data/instances/<实例名>/ 下），它的内容不会生效；可能是没升级的桌面端写的`)
  }
}
