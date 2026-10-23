import path from 'node:path'
import { DATA_DIR } from '@/common/globalVars'

// The bot's own settings under data/config/ (docs/config-storage.md §3), next to the plugin files that
// globalVars.ts lays out the same way. Worked out from DATA_DIR on every call instead of being module
// constants, so test suites that mock globalVars only have to provide DATA_DIR.
export const configPaths = {
  /** Instance-wide settings: log, logLevel, ffmpeg, msgCacheExpire, ... */
  globalSettings: () => path.join(DATA_DIR, 'config', 'global', 'settings.json'),
  /** One account's settings: the adapters' endpoints and the WebUI address. */
  accountSettings: (uin: string) => path.join(DATA_DIR, 'config', 'accounts', uin, 'settings.json'),
  email: () => path.join(DATA_DIR, 'config', 'global', 'email.json'),
  /** Where these lived before; read once to migrate, then renamed to *.bak. */
  legacyAccount: (uin: string) => path.join(DATA_DIR, `config_${uin}.json`),
  legacyEmail: () => path.join(DATA_DIR, 'email_config.json'),
}

export const LEGACY_ACCOUNT_FILE = /^config_(\d+)\.json$/
