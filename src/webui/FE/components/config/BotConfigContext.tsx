import React, { createContext, useContext } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Config } from '../../types'

interface BotConfigContextValue {
  /** config_<uin>.json, which App loads once the WebUI is logged in. */
  config: Config
  setConfig(config: Config): void
  /**
   * Saves just these sections; the server merges them in. Sending the whole config would write back this
   * tab's stale copies of whatever another page, set_config or a hand edit changed meanwhile.
   */
  save(sections: Partial<Config>): Promise<void>
  saving: boolean
}

export const BotConfigContext = createContext<BotConfigContextValue | null>(null)

/** For the settings pages of builtin plugins: they are rendered as plugin pages, away from App's state. */
export function useBotConfig(): BotConfigContextValue {
  const value = useContext(BotConfigContext)
  if (!value) throw new Error('useBotConfig() only works below the BotConfigContext that App provides')
  return value
}

export const SaveButton: React.FC<{ saving: boolean; onClick: () => void; className?: string }> = ({ saving, onClick, className = '' }) => (
  <button onClick={onClick} disabled={saving} className={`btn-primary flex items-center gap-2 ${className}`}>
    {saving ? (
      <>
        <Loader2 size={20} className="animate-spin" />
        保存中...
      </>
    ) : (
      <>
        <Save size={20} />
        保存配置
      </>
    )}
  </button>
)
