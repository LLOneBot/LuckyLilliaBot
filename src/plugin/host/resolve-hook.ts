import * as nodeModule from 'node:module'

/** Packages a plugin must share with the host: a second copy of cordis breaks services and events. */
export const SHARED_SPECIFIERS = [
  '@luckylillia/plugin-sdk',
  'cordis',
  'cosmokit',
  'schemastery',
  '@standard-schema/spec',
  '@satorijs/element',
  '@satorijs/protocol',
] as const

export interface ResolverState {
  /** Bare specifier -> the URL the host itself resolves it to. */
  shared: Map<string, string>
  /** Plugin package directories as file URLs ending with a slash. */
  roots: string[]
}

export function sharedSpecifierMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const specifier of SHARED_SPECIFIERS) {
    try {
      map.set(specifier, import.meta.resolve(specifier))
    } catch {
      // e.g. the SDK is not built yet in a fresh checkout
    }
  }
  return map
}

/**
 * Two jobs: pin shared packages to the host copy, and copy the `?v=` reload epoch from a plugin module
 * to the modules it imports inside the same package. Without the latter only the entry would be
 * re-evaluated on reload and every relative import would come back from the ESM cache.
 */
export function resolvePluginSpecifier(
  state: ResolverState,
  specifier: string,
  context: nodeModule.ResolveHookContext,
  nextResolve: (specifier: string, context?: Partial<nodeModule.ResolveHookContext>) => nodeModule.ResolveFnOutput,
): nodeModule.ResolveFnOutput {
  const pinned = state.shared.get(specifier)
  if (pinned) return { url: pinned, shortCircuit: true }
  const result = nextResolve(specifier, context)
  const parent = context.parentURL
  if (!parent?.startsWith('file:') || !result.url.startsWith('file:')) return result
  const epoch = new URL(parent).searchParams.get('v')
  if (!epoch) return result
  const root = packageRootOf(state.roots, parent)
  if (!root || !stripQuery(result.url).startsWith(root)) return result
  const url = new URL(result.url)
  url.searchParams.set('v', epoch)
  return { ...result, url: url.href }
}

/** Returns undefined when this Node has no module.registerHooks (added in 22.15). */
export function installPluginResolver(state: ResolverState): (() => void) | undefined {
  const registerHooks = (nodeModule as Partial<typeof nodeModule>).registerHooks
  if (!registerHooks) return
  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) => resolvePluginSpecifier(state, specifier, context, nextResolve),
  })
  return () => hooks.deregister()
}

function packageRootOf(roots: string[], url: string): string | undefined {
  const bare = stripQuery(url)
  let best: string | undefined
  for (const root of roots) {
    if (bare.startsWith(root) && (!best || root.length > best.length)) best = root
  }
  return best
}

function stripQuery(url: string): string {
  const index = url.search(/[?#]/)
  return index < 0 ? url : url.slice(0, index)
}
