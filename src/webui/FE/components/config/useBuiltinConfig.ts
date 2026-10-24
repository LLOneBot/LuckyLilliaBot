import { useCallback, useEffect, useState } from 'react'
import { usePluginList } from '../../plugin-host/pluginList'
import { ConfigConflictError, ConfigRejectedError, describePlugin, savePluginConfig } from '../../utils/pluginApi'
import { showToast } from '../common'

/**
 * A builtin's settings through the plugin API, stored in its plugin entry like any plugin's: the server
 * validates against the builtin's schema and rules, and refuses a write that would clobber a newer one (409).
 */
export function useBuiltinConfig<T>(name: string) {
  const entry = usePluginList(state => state.plugins?.find(plugin => plugin.name === name))
  const id = entry?.id
  const [value, setValue] = useState<T | null>(null)
  const [rev, setRev] = useState<string>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const description = await describePlugin(id)
      setValue(description.effective as T)
      setRev(description.rev)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (next: T, options: { clear?: string[]; message?: string } = {}) => {
    if (!id) return false
    setSaving(true)
    try {
      await savePluginConfig(id, next, { ifRev: rev, clear: options.clear })
      showToast(options.message ?? '配置保存成功', 'success')
      await load()
      return true
    } catch (e) {
      if (e instanceof ConfigRejectedError) {
        showToast(e.issues[0]?.message ?? e.message, 'error')
      } else if (e instanceof ConfigConflictError) {
        await load()
        showToast('配置在别处被改过，已重新载入最新值', 'error')
      } else {
        showToast(e instanceof Error ? e.message : '保存失败', 'error')
      }
      return false
    } finally {
      setSaving(false)
    }
  }, [id, rev, load])

  return { value, setValue, save, saving, error }
}
