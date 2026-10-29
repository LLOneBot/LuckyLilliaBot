import React from 'react'
import { Loader2 } from 'lucide-react'
import { usePluginConfig, type WebUIPlugin } from '@luckylillia/plugin-sdk/webui'
import type { OB11Config } from '../../../../../common/types'
import Connections from './Connections'

export const name = 'builtin:onebot11'

const OneBotSettings: React.FC = () => {
  const { value, setValue, save, error } = usePluginConfig<OB11Config>()
  if (error) return <p className="card p-6 text-sm text-red-500">加载 OneBot 11 配置失败：{error}</p>
  if (!value) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  return (
    <Connections
      config={value}
      onChange={setValue}
      // The page saves on every add, delete and toggle; each save reloads, so the next one carries a fresh rev
      onSave={next => { void save(next ?? value) }}
    />
  )
}

const apply: WebUIPlugin = (ctx) => {
  ctx.page({ id: 'onebot', title: 'OneBot 11', icon: 'radio', component: OneBotSettings, order: 10, settings: true })
}

export default apply
