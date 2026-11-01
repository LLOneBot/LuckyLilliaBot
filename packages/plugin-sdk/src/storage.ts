/** `ctx.storage`: where a plugin keeps its own files. */
export interface PluginStorage {
  /**
   * Created on first use, shared by every entry of the package, kept when the plugin is uninstalled.
   *
   * - `'global'` (default): `plugin-data/<package>/shared/` in the instance directory.
   * - `'account'`: `plugin-data/<package>/<uin>/`, one per QQ account. Only after login: list `account` in
   *   `inject` or call it inside `ctx.inject(['account'], ...)`. Elsewhere it rejects, even if an account
   *   happens to be online already.
   */
  dir(scope?: 'global' | 'account'): Promise<string>
  /**
   * `plugin-data/<package>/bots/<platform>+<selfId>/`, one per bot, the QQ official bot's too; `bot` is the bot or
   * its sid. Needs no login, unlike `'account'`.
   */
  dir(scope: 'bot', bot: string | { sid: string }): Promise<string>
}

declare module 'cordis' {
  interface Context {
    storage: PluginStorage
  }
}
