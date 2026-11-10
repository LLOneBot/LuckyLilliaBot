export type PluginOrigin = 'all' | 'builtin' | 'third-party'

export const matchesOrigin = (builtin: boolean, origin: PluginOrigin): boolean => (
  origin === 'all' || (origin === 'builtin' ? builtin : !builtin)
)
