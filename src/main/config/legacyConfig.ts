import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import { LegacyConfig } from '@/common/types'
import { deepMerge } from '@/common/utils'
import { ADAPTER_ENTRIES, ADAPTER_KEYS, DEPRECATED_KEYS } from './upgrade'

/**
 * The bot settings with the adapters' sections put back in, each `enable` being its entry switch: the shape
 * OneBot get_config has always returned.
 */
export function legacyConfig(ctx: Context): LegacyConfig {
  const config: Dict = { ...ctx.config.get() }
  config.musicSignUrl = config.musicCardSignUrl
  // get(): the callers (an OneBot action, a WebUI route) do not inject the plugin service
  const plugins = ctx.get('plugins')
  for (const key of ADAPTER_KEYS) {
    const settings = plugins?.builtinSettings(ADAPTER_ENTRIES[key])
    if (settings) config[key] = { ...settings.config as Dict, enable: settings.enabled }
  }
  return config as LegacyConfig
}

/**
 * Applies a partial config in that shape. An adapter's section goes to its plugin entry, merged per key like
 * ConfigService.patch, with `enable` switching the entry; the rest goes to the settings file. A section its
 * plugin refuses throws PluginConfigError. `rules: false` leaves out the adapters' own rules (the token one).
 */
export async function applyLegacyConfig(ctx: Context, partial: Dict, options: { rules?: boolean } = {}): Promise<void> {
  const rest = { ...partial }
  if ('musicSignUrl' in rest) {
    rest.musicCardSignUrl ??= rest.musicSignUrl
    delete rest.musicSignUrl
  }
  for (const key of DEPRECATED_KEYS) delete rest[key]
  const plugins = ctx.get('plugins')
  for (const key of ADAPTER_KEYS) {
    const section = rest[key] as Dict | undefined
    delete rest[key]
    const settings = plugins?.builtinSettings(ADAPTER_ENTRIES[key])
    if (!section || typeof section !== 'object' || !settings) continue
    const { enable, ...changes } = section
    // Off first, so the rules for a running adapter do not hold up a section that switches it off anyway
    if (enable === false && settings.enabled) await plugins!.disable(settings.id)
    if (Object.keys(changes).length) {
      await plugins!.updateConfig(settings.id, deepMerge(settings.config, changes), undefined, [], options)
    }
    if (enable === true && !settings.enabled) await plugins!.enable(settings.id, options)
  }
  if (!Object.keys(rest).length) return
  const next = ctx.config.patch(rest)
  // The file is written by now: a listener failing to apply it must not turn the save into an error
  await ctx.parallel('llob/config-updated', next).catch(e => ctx.logger.warn('applying the settings', e))
}
