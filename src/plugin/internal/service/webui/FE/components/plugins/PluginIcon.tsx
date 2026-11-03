import React, { useState } from 'react'
import { PluginStatus } from '../../types/plugins'
import { pluginIcon } from './meta'

interface PluginIconProps {
  plugin: PluginStatus
  /** Size and corners of the tile */
  className: string
  /** Fill and color of the tile behind a lucide icon; an image gets a quiet fill instead */
  fill: string
  /** Of the lucide icon */
  size: number
  /** Not running: the image goes grey, as the lucide icon's fill does */
  muted?: boolean
}

/** A plugin's icon in its tile: the image its package names in `llbot.icon`, else the lucide icon it names. */
const PluginIcon: React.FC<PluginIconProps> = ({ plugin, className, fill, size, muted }) => {
  // A broken image falls back to the lucide icon, until the URL changes
  const [broken, setBroken] = useState<string>()
  const image = plugin.iconUrl && plugin.iconUrl !== broken ? plugin.iconUrl : undefined
  if (image) {
    return (
      <div className={`flex-shrink-0 overflow-hidden fill-quiet ${className}`}>
        <img
          src={image}
          alt=""
          draggable={false}
          onError={() => setBroken(image)}
          className={`w-full h-full object-cover transition-[filter,opacity] ${muted ? 'grayscale opacity-60' : ''}`}
        />
      </div>
    )
  }
  const Icon = pluginIcon(plugin)
  return (
    <div className={`flex items-center justify-center flex-shrink-0 ${fill} ${className}`}>
      <Icon size={size} />
    </div>
  )
}

export default PluginIcon
