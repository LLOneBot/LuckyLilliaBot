import { existsSync, FSWatcher, watch } from 'node:fs'
import path from 'node:path'

/**
 * Reports the top-level package directory each change under a root belongs to. Debouncing is up to
 * the caller. fs.watch rides on inotify on Linux, which docker bind mounts often do not deliver;
 * the WebUI reload button is the fallback there.
 */
export function watchPluginRoots(
  roots: string[],
  onChange: (packageDir: string) => void,
  onError: (error: Error) => void,
): () => void {
  const watchers: FSWatcher[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const parts = filename.toString().split(/[\\/]/)
        if (parts.some(part => part === 'node_modules' || part.startsWith('.'))) return
        const depth = parts[0].startsWith('@') ? 2 : 1
        if (parts.length < depth) return
        onChange(path.join(root, ...parts.slice(0, depth)))
      })
      watcher.on('error', onError)
      watchers.push(watcher)
    } catch (e) {
      onError(e as Error)
    }
  }
  return () => {
    for (const watcher of watchers) watcher.close()
  }
}
