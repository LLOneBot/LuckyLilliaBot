import Schema from 'schemastery'
import type { OB11Config } from '@/common/types'
import type { BuiltinConfig } from '../../plugin'
import { ob11Issues } from '../config/validate'
import { fromTemplate } from './template'

export type OB11Settings = Omit<OB11Config, 'enable'>

const port = (fallback: number) => Schema.natural().min(1).max(65535).default(fallback)
const heartInterval = () => Schema.natural().role('ms').default(60000).description('心跳间隔')

// Shared by every connection type. `name` and `filter` have no default: the desktop app writes null for them
const common = {
  name: Schema.string().description('自定义名称'),
  enable: Schema.boolean().default(false).description('启用此适配器'),
  token: Schema.string().role('secret').default('').description('Token：访问令牌'),
  messageFormat: Schema.union([
    Schema.const('array').description('消息段 (array)'),
    Schema.const('string').description('CQ 码 (string)'),
  ]).role('radio').default('array').description('消息格式'),
  reportSelfMessage: Schema.boolean().default(false).description('上报自己发送的消息'),
  reportOfflineMessage: Schema.boolean().default(false).description('上报离线消息'),
  debug: Schema.boolean().default(false).description('调试模式'),
  filter: Schema.any().description('事件过滤器（sift 查询）'),
}

// Objects are not strict, so keys a connection type does not use (the desktop app writes every field on
// every connection) pass through untouched
const Ws = Schema.object({
  type: Schema.const('ws').required(),
  host: Schema.string().role('host').default('127.0.0.1').description('监听地址（留空 = 监听全部地址）'),
  port: port(3001).description('端口'),
  heartInterval: heartInterval(),
  ...common,
}).description('WebSocket 正向')

const WsReverse = Schema.object({
  type: Schema.const('ws-reverse').required(),
  url: Schema.string().default('').description('连接地址'),
  heartInterval: heartInterval(),
  ...common,
}).description('WebSocket 反向')

const Http = Schema.object({
  type: Schema.const('http').required(),
  host: Schema.string().role('host').default('127.0.0.1').description('监听地址（留空 = 监听全部地址）'),
  port: port(3000).description('端口'),
  ...common,
}).description('HTTP 服务')

const HttpPost = Schema.object({
  type: Schema.const('http-post').required(),
  url: Schema.string().default('').description('上报地址'),
  enableHeart: Schema.boolean().default(false).description('启用心跳'),
  heartInterval: heartInterval(),
  ...common,
}).description('HTTP 上报')

// Defaults mirror defaultConfig.ts (a test pins them); a new entry gets default_config.json's rows
export const OB11Schema: Schema<OB11Settings> = Schema.object({
  connect: Schema.array(Schema.union([Ws, WsReverse, Http, HttpPost])).default([]).description('适配器'),
}) as unknown as Schema<OB11Settings>

export const ob11Settings: BuiltinConfig<OB11Settings> = {
  check: ob11Issues,
  // The token rule guards a public listener: switching on must not bypass it
  checkOnEnable: true,
  initial: () => fromTemplate('ob11'),
}
