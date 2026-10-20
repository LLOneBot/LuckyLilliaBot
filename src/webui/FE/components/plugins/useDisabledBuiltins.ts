import { useEffect, useState } from 'react'
import { listPlugins, openPluginStream } from '../../utils/pluginApi'

/**
 * Names of the builtin plugins switched off on the plugin page, kept live through the plugin stream.
 * Empty while unknown or unreadable, so nothing gets hidden by mistake.
 */
export function useDisabledBuiltins(enabled: boolean): ReadonlySet<string> {
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const refresh = () => {
      listPlugins()
        .then((list) => {
          if (alive) setDisabled(new Set(list.filter(plugin => plugin.builtin && plugin.disabled).map(plugin => plugin.name)))
        })
        .catch(() => {})
    }
    refresh()
    const close = openPluginStream((event) => {
      if (event.type === 'list') return refresh()
      const { builtin, disabled: off, name } = event.data
      if (!builtin) return
      setDisabled((previous) => {
        if (previous.has(name) === off) return previous
        const next = new Set(previous)
        if (off) next.add(name)
        else next.delete(name)
        return next
      })
    })
    return () => {
      alive = false
      close()
    }
  }, [enabled])

  return disabled
}
