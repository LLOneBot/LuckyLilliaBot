import React from 'react'
import { Loader2 } from 'lucide-react'
import type { OB11Config } from '../../types'
import OneBotConfigNew from './OneBotConfigNew'
import { useBuiltinConfig } from './useBuiltinConfig'

const OneBotConfigPage: React.FC = () => {
  const { value: ob11, setValue, save, error } = useBuiltinConfig<OB11Config>('builtin:onebot11')
  if (error) return <p className="card p-6 text-sm text-red-500">加载 OneBot 11 配置失败：{error}</p>
  if (!ob11) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  return (
    <OneBotConfigNew
      config={ob11}
      onChange={setValue}
      // The page saves on every add, delete and toggle; each save reloads, so the next one carries a fresh rev
      onSave={next => { void save(next ?? ob11) }}
    />
  )
}

export default OneBotConfigPage
