import type { BuiltinPlugin } from '../../../host'
import * as NTProtocol from '.'
import { ntProtocolSettings } from './settings'

export const builtin: BuiltinPlugin = {
  // Switched off, everything that needs the scanned account waits: the adapters, WebQQ, the neutral layer's bot
  name: 'builtin:nt-protocol',
  title: 'NTQQ 协议',
  plugin: NTProtocol,
  config: ntProtocolSettings,
  manifest: {
    category: 'protocol',
    icon: 'smartphone',
    service: { implements: ['qqProtocol', 'account'], labels: { account: 'NTQQ 账号登录' } },
    description: {
      zh: '扫码或快速登录的 QQ 账号（纯协议或官方 QQ 端桥接）；OneBot、Satori、Milky、WebQQ 都靠它收发消息',
      en: 'The QQ account logged in by QR code or quick login (pure protocol, or bridged to an official QQ client), which OneBot, Satori, Milky and WebQQ run on',
    },
  },
}
