import { Context, Plugin } from 'cordis'
import type { BuiltinPlugin } from '../plugin'
import { Config as LLBotConfig } from '../common/types'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import MilkyAdapter from '../milky/adapter'
import EmailNotificationService from '../common/emailNotification'
import * as NTQQUniversal from '../universal/ntqq'
import { WebQQ } from '../webui/BE/routes/webqq'

/**
 * Mounts an adapter with its part of config_<uin>.json, which only exists once the account is known.
 * The adapter's own dependencies are repeated so the entry stays pending until the adapter can start.
 */
function withBotConfig<T>(name: string, plugin: Plugin<T> & { inject: string[] }, select: (config: LLBotConfig) => T): Plugin {
  return {
    name,
    inject: ['account', 'config', ...plugin.inject],
    // Awaited so that an adapter failing to start fails the entry, not just a child of it
    async apply(ctx: Context) {
      await ctx.plugin(plugin, select(ctx.config.get()))
    },
  }
}

export const builtinPlugins: BuiltinPlugin[] = [
  {
    name: 'builtin:onebot11',
    title: 'OneBot 11',
    plugin: withBotConfig('builtin:onebot11', OneBot11Adapter, config => ({
      ...config.ob11,
      musicSignUrl: config.musicSignUrl,
      enableLocalFile2Url: config.enableLocalFile2Url!,
      ffmpeg: config.ffmpeg,
    })),
    manifest: {
      icon: 'radio',
      service: { implements: ['onebot'] },
      description: {
        zh: 'OneBot 11 协议适配器，支持 HTTP、正向 / 反向 WebSocket 和 HTTP POST 上报',
        en: 'OneBot 11 adapter over HTTP, WebSocket, reverse WebSocket and HTTP POST',
      },
    },
  },
  {
    name: 'builtin:satori',
    title: 'Satori',
    plugin: withBotConfig('builtin:satori', SatoriAdapter, config => ({
      ...config.satori,
      ffmpeg: config.ffmpeg,
    })),
    manifest: {
      icon: 'cpu',
      service: { implements: ['satori'] },
      description: { zh: 'Satori 协议适配器', en: 'Satori protocol adapter' },
    },
  },
  {
    name: 'builtin:milky',
    title: 'Milky',
    plugin: withBotConfig('builtin:milky', MilkyAdapter, config => config.milky),
    manifest: {
      icon: 'milk',
      service: { implements: ['milky'] },
      description: { zh: 'Milky 协议适配器', en: 'Milky protocol adapter' },
    },
  },
  {
    name: 'builtin:webqq',
    title: 'WebQQ',
    plugin: WebQQ,
    manifest: {
      icon: 'message-square',
      description: { zh: '在 WebUI 里像 QQ 客户端一样收发消息', en: 'Chat from the WebUI like a QQ client' },
    },
  },
  {
    name: 'builtin:email-notification',
    title: '邮件通知',
    plugin: EmailNotificationService,
    manifest: {
      icon: 'mail',
      service: { implements: ['emailNotification'] },
      description: { zh: '账号掉线时发邮件提醒', en: 'Sends an email when the account goes offline' },
    },
  },
  {
    // The Satori adapter receives its events from here, so it stays on
    name: 'builtin:ntqq-universal',
    title: '中立层',
    plugin: NTQQUniversal,
    manifest: {
      icon: 'network',
      description: {
        zh: '把 QQ 的消息和事件转换成 Satori 格式，插件和 Satori 适配器都从这里收消息',
        en: 'Turns QQ messages and events into Satori sessions for plugins and the Satori adapter',
      },
    },
    core: true,
  },
]
