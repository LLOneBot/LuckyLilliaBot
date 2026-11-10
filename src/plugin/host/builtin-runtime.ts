/** Private runtime imports for official packages. Shared values keep native state and service classes singular. */
const KEY = Symbol.for('luckylillia.builtin-runtime.v1')
const PREFIX = '@luckylillia/bot-runtime/'
type RuntimeModules = Record<string, Record<string, unknown>>

export function registerBuiltinRuntime(modules: RuntimeModules): void {
  Object.defineProperty(globalThis, KEY, { value: modules, configurable: true })
}

export function builtinRuntimeModule(specifier: string): string | undefined {
  if (!specifier.startsWith(PREFIX)) return
  const name = specifier.slice(PREFIX.length)
  const modules = (globalThis as Record<symbol, RuntimeModules>)[KEY]
  const namespace = modules?.[name]
  if (!namespace) throw new Error('Built-in plugin requires an unavailable Bot runtime module: ' + name)
  const source = [
    'const m = globalThis[Symbol.for("luckylillia.builtin-runtime.v1")][' + JSON.stringify(name) + ']',
    ...Object.keys(namespace).map(key => key === 'default' ? 'export default m.default'
      : 'export const ' + key + ' = m[' + JSON.stringify(key) + ']'),
  ].join('\n')
  return 'data:text/javascript,' + encodeURIComponent(source)
}
