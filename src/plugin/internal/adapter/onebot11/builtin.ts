import type { BuiltinPlugin } from '../../../host'
import { adapterEntry } from '../adapterEntry'
import OneBot11Adapter from './adapter'
import { OB11Schema, ob11Settings } from './settings'

export const builtin: BuiltinPlugin = {
  name: 'builtin:onebot11',
  title: 'OneBot 11',
  config: ob11Settings,
  plugin: adapterEntry('builtin:onebot11', OneBot11Adapter, OB11Schema, config => ({
    musicCardSignUrl: config.musicCardSignUrl,
    ffmpeg: config.ffmpeg,
  })),
  manifest: {
    category: 'adapter',
    icon: 'radio',
    service: { implements: ['onebot'] },
    description: {
      zh: 'OneBot 11 协议适配器，支持 HTTP、正向 / 反向 WebSocket 和 HTTP POST 上报',
      en: 'OneBot 11 adapter over HTTP, WebSocket, reverse WebSocket and HTTP POST',
    },
  },
}
