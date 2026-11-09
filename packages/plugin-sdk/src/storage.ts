/** `ctx.storage`: where a plugin keeps its own files. */
export interface PluginStorage {
  /**
   * Created on first use, shared by every entry of the package, kept when the plugin is uninstalled.
   *
   * - `'global'` (default): `plugin-data/<package>/shared/` in the instance directory.
   */
  dir(scope?: 'global'): Promise<string>
  /**
   * `plugin-data/<package>/bots/<platform>+<selfId>/`, one per bot, the QQ official bot's too; `bot` is the bot or
   * its sid. Needs no login. Existing legacy QQ directories are reused if no bot directory exists.
   */
  dir(scope: 'bot', bot: string | { sid: string }): Promise<string>
}

declare module 'cordis' {
  interface Context {
    storage: PluginStorage
  }
}
