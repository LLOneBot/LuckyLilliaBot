import type { BuiltinConfigBinding } from '../../plugin'
import type { Config as LLBotConfig } from '@/common/types'

type AdapterKey = 'satori' | 'milky' | 'ob11'

/**
 * An adapter's section of config_<uin>.json. The adapters pick a change up themselves through
 * llob/config-updated (each rebuilds only when its own section changed), which is also how an edit by
 * the desktop app or by hand reaches them -- so a write is the same patch the other-settings page does.
 */
export function botConfigBinding<K extends AdapterKey>(
  key: K,
  rest: Pick<BuiltinConfigBinding<LLBotConfig[K]>, 'schema' | 'check' | 'normalize'>,
): BuiltinConfigBinding<LLBotConfig[K]> {
  return {
    ...rest,
    scope: 'account',
    location: `config/accounts/<uin>/settings.json → ${key}`,
    // The token rule guards a public listener: switching on must not bypass it
    validateOnEnable: true,
    read(ctx) {
      // PluginService does not inject config: reach it without the strict check
      const config = ctx.get('config')
      // Before login (and without -q) there is no account file, and a write would be dropped
      return config?.accountFile ? structuredClone(config.get()[key]) : undefined
    },
    async write(ctx, value) {
      const next = ctx.get('config')!.patch({ [key]: value })
      // The file is written by now: a listener failing to apply it must not turn the save into an error
      await ctx.parallel('llob/config-updated', next).catch(e => ctx.logger.warn(`applying ${key} settings`, e))
    },
    enabled: { get: value => !!value.enable, set: (value, on) => ({ ...value, enable: on }) },
    watch: (ctx, changed) => ctx.on('llob/config-updated', changed),
  }
}
