import path from 'node:path'
import { DATA_DIR } from '@/common/globalVars'
import { currentInstance, instancesDir } from '@/common/instance'

/** What an instance directory holds (docs/config-storage.md §3). */
export const INSTANCE_FILES = {
  /** The bot's own settings: log, logLevel, ffmpeg, webui, ... */
  settings: 'settings.json',
  plugins: 'plugins.json',
  email: 'email.json',
  webuiToken: 'webui_token.txt',
  pluginData: 'plugin-data',
} as const

// Worked out on every call rather than held in module constants: suites that mock globalVars only have to
// provide DATA_DIR, and nothing pins the instance before main.ts has run the startup migration.
export const configPaths = {
  instance: (name = currentInstance().name) => path.join(instancesDir(), name),
  settings: (name?: string) => path.join(configPaths.instance(name), INSTANCE_FILES.settings),
  plugins: (name?: string) => path.join(configPaths.instance(name), INSTANCE_FILES.plugins),
  email: (name?: string) => path.join(configPaths.instance(name), INSTANCE_FILES.email),
  webuiToken: (name?: string) => path.join(configPaths.instance(name), INSTANCE_FILES.webuiToken),
  pluginData: (name?: string) => path.join(configPaths.instance(name), INSTANCE_FILES.pluginData),
}

/** Where things lived before instances: read once by the startup migration, then renamed to *.bak. */
export const legacyPaths = {
  account: (uin: string) => path.join(DATA_DIR, `config_${uin}.json`),
  email: () => path.join(DATA_DIR, 'email_config.json'),
  webuiToken: () => path.join(DATA_DIR, 'webui_token.txt'),
  /** The unreleased data/config/{global,accounts/<uin>}/ layout. */
  configDir: () => path.join(DATA_DIR, 'config'),
  /** The plugin entries before data/config/, from early in this branch. */
  pluginsFile: () => path.join(DATA_DIR, 'plugins.json'),
  pluginData: () => path.join(DATA_DIR, 'plugin-data'),
}

export const LEGACY_ACCOUNT_FILE = /^config_(\d+)\.json$/
