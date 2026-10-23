/** `ctx.storage`: where a plugin keeps its own files. */
export interface PluginStorage {
  /**
   * A directory for this plugin's files, created on first use and shared by every instance of the package.
   * Uninstalling the plugin leaves it in place.
   *
   * - `'global'` (default): `data/plugin-data/<package>/shared/`, the same for every account.
   * - `'account'`: `data/plugin-data/<package>/<uin>/`, one per QQ account. Only for code that runs after
   *   login: list `account` in the plugin's `inject`, or call it inside a `ctx.inject(['account'], ...)`
   *   block. Anywhere else it rejects, even when an account happens to be online already, so a plugin
   *   cannot work after login and then break the next time it starts before one.
   *
   * Structured per-account data can also go into `ctx.database`.
   */
  dir(scope?: 'global' | 'account'): Promise<string>
}

declare module 'cordis' {
  interface Context {
    storage: PluginStorage
  }
}
