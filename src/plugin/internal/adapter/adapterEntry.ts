import { Context, Plugin } from 'cordis'
import Schema from 'schemastery'
import { Config as LLBotConfig } from '../../../common/types'

/**
 * Mounts an adapter with its entry's settings plus the bot settings it reads.
 * The adapter's own dependencies are repeated so the entry stays pending until the adapter can start.
 */
export function adapterEntry<T extends { enable: boolean }>(
  name: string,
  plugin: Plugin<T> & { inject: string[] },
  Config: Schema,
  fromBotSettings: (config: LLBotConfig) => Partial<T> = () => ({}),
): Plugin {
  return {
    name,
    inject: ['config', ...plugin.inject],
    Config,
    // Awaited so that an adapter failing to start fails the entry, not just a child of it
    async apply(ctx: Context, config: Omit<T, 'enable'>) {
      // The entry switch is what turns an adapter on; its `enable` flag only ever says yes now
      await ctx.plugin(plugin, { ...config, enable: true, ...fromBotSettings(ctx.config.get()) } as T)
    },
  }
}
