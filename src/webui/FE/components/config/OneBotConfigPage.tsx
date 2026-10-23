import React from 'react'
import OneBotConfigNew from './OneBotConfigNew'
import { useBotConfig } from './BotConfigContext'

const OneBotConfigPage: React.FC = () => {
  const { config, setConfig, save } = useBotConfig()
  return (
    <OneBotConfigNew
      config={config.ob11}
      onChange={ob11 => setConfig({ ...config, ob11 })}
      onSave={ob11 => save({ ob11: ob11 ?? config.ob11 })}
    />
  )
}

export default OneBotConfigPage
