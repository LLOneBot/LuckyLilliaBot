import { Context, Plugin } from 'cordis'
import Schema from 'schemastery'
import type { BuiltinPlugin } from '../plugin'
import { Config as LLBotConfig } from '../common/types'
import OneBot11Adapter from '../onebot11/adapter'
import SatoriAdapter from '../satori/adapter'
import MilkyAdapter from '../milky/adapter'
import EmailNotificationService from '../emailNotification'
import * as NTProtocol from './ntProtocol'
import * as NTQQUniversal from '../universal/ntqq'
import * as QQOfficial from '../universal/qqofficial'
import { WebQQ } from '../webui/BE/routes/webqq'
import { emailSettings } from './builtinConfig/email'
import { SatoriSchema, satoriSettings } from './builtinConfig/satori'
import { MilkySchema, milkySettings } from './builtinConfig/milky'
import { OB11Schema, ob11Settings } from './builtinConfig/onebot'
import { qqOfficialSettings } from './builtinConfig/qqofficial'
import { ntProtocolSettings } from './builtinConfig/ntProtocol'

/**
 * Mounts an adapter once the account is known, with its entry's settings plus the bot settings it reads.
 * The adapter's own dependencies are repeated so the entry stays pending until the adapter can start.
 */
function adapterEntry<T extends { enable: boolean }>(
  name: string,
  plugin: Plugin<T> & { inject: string[] },
  Config: Schema,
  fromBotSettings: (config: LLBotConfig) => Partial<T> = () => ({}),
): Plugin {
  return {
    name,
    inject: ['account', 'config', ...plugin.inject],
    Config,
    // Awaited so that an adapter failing to start fails the entry, not just a child of it
    async apply(ctx: Context, config: Omit<T, 'enable'>) {
      // The entry switch is what turns an adapter on; its `enable` flag only ever says yes now
      await ctx.plugin(plugin, { ...config, enable: true, ...fromBotSettings(ctx.config.get()) } as T)
    },
  }
}

export const builtinPlugins: BuiltinPlugin[] = [
  {
    // Switched off, everything that needs the scanned account waits: the adapters, WebQQ, the neutral layer's bot
    name: 'builtin:nt-protocol',
    title: 'NTQQ 协议',
    plugin: NTProtocol,
    config: ntProtocolSettings,
    manifest: {
      category: 'protocol',
      icon: 'smartphone',
      service: { implements: ['qqProtocol', 'account'] },
      description: {
        zh: '扫码或快速登录的 QQ 账号（纯协议或官方 QQ 端桥接）；OneBot、Satori、Milky、WebQQ 都靠它收发消息',
        en: 'The QQ account logged in by QR code or quick login (pure protocol, or bridged to an official QQ client), which OneBot, Satori, Milky and WebQQ run on',
      },
    },
  },
  {
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
  },
  {
    name: 'builtin:satori',
    title: 'Satori',
    config: satoriSettings,
    plugin: adapterEntry('builtin:satori', SatoriAdapter, SatoriSchema, config => ({ ffmpeg: config.ffmpeg })),
    manifest: {
      category: 'adapter',
      icon: 'cpu',
      service: { implements: ['satori'] },
      description: { zh: 'Satori 协议适配器', en: 'Satori protocol adapter' },
    },
  },
  {
    name: 'builtin:milky',
    title: 'Milky',
    config: milkySettings,
    plugin: adapterEntry('builtin:milky', MilkyAdapter, MilkySchema),
    manifest: {
      category: 'adapter',
      icon: 'milk',
      service: { implements: ['milky'] },
      description: { zh: 'Milky 协议适配器', en: 'Milky protocol adapter' },
    },
  },
  {
    name: 'builtin:qq-official',
    title: 'QQ 官方机器人',
    plugin: QQOfficial,
    config: qqOfficialSettings,
    manifest: {
      category: 'protocol',
      icon: 'bot',
      description: {
        zh: '接入 QQ 开放平台的官方机器人（AppID 登录），插件同样能在它上面收发消息',
        en: 'Runs a QQ open platform bot (AppID login) that plugins can chat through as well',
      },
    },
  },
  {
    name: 'builtin:webqq',
    title: 'WebQQ',
    plugin: WebQQ,
    manifest: {
      category: 'tool',
      icon: 'message-square',
      description: { zh: '在 WebUI 里像 QQ 客户端一样收发消息', en: 'Chat from the WebUI like a QQ client' },
    },
  },
  {
    name: 'builtin:email-notification',
    title: '邮件通知',
    plugin: EmailNotificationService,
    config: emailSettings,
    manifest: {
      category: 'tool',
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
      category: 'service',
      icon: 'network',
      // Pure plumbing with no switch and no settings: not something to manage, so keep it out of the list
      hidden: true,
      description: {
        zh: '把 QQ 的消息和事件转换成 Satori 格式，插件和 Satori 适配器都从这里收消息',
        en: 'Turns QQ messages and events into Satori sessions for plugins and the Satori adapter',
      },
    },
    core: true,
  },
]
