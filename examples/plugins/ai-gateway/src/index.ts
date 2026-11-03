import { Context, Schema } from '@luckylillia/plugin-sdk'
import { AiEntry, AiError, AiGatewayService, GatewaySettings, GatewayState } from './gateway.js'

export type * from './types.js'

export const name = 'ai-gateway'

export interface AiConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  vision: boolean
  proxy: boolean
  timeout: number
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface Config {
  ais: AiConfig[]
  default: string
}

const AiSchema: Schema<AiConfig> = Schema.object({
  name: Schema.string().required().description('名称：别的插件按它选 AI，起好后别再改'),
  baseUrl: Schema.string().role('link').pattern(/^https?:\/\/\S+$/i).required().description(
    'OpenAI 兼容的接口地址，填到版本号为止（带 /chat/completions 的完整地址也行）。比如 OpenAI https://api.openai.com/v1、'
    + 'DeepSeek https://api.deepseek.com/v1、智谱 https://open.bigmodel.cn/api/paas/v4、豆包 https://ark.cn-beijing.volces.com/api/v3、'
    + '通义千问 https://dashscope.aliyuncs.com/compatible-mode/v1、Kimi https://api.moonshot.cn/v1、'
    + 'Gemini https://generativelanguage.googleapis.com/v1beta/openai',
  ),
  apiKey: Schema.string().role('secret').default('').description('API Key'),
  model: Schema.string().required().description('模型，比如 gpt-4o、deepseek-chat'),
  vision: Schema.boolean().default(false).description('能看图：模型支持图片输入。要看图的插件会优先让你选这种'),
  proxy: Schema.boolean().default(true).description('走代理：内置的「代理」插件填了地址时经它连接。国内能直连的服务（DeepSeek 等）可以关掉'),
  timeout: Schema.natural().role('ms').default(120_000).description('等多久没有回答就算失败；流式回答是两段之间最多等多久'),
  headers: Schema.dict(Schema.string()).default({}).description('额外的请求头'),
  body: Schema.dict(Schema.any()).default({}).description('请求体里额外带的字段，比如关掉思考：enable_thinking 填 false'),
})

export const Config: Schema<Config> = Schema.object({
  ais: Schema.array(AiSchema).default([]).description('AI 列表'),
  default: Schema.string().role('ai').default('').description('默认的 AI：别的插件没指定时用它，留空就用列表里第一个'),
})

/** `https://api.openai.com/v1/chat/completions/` and `https://api.openai.com/v1` alike become the latter */
export function baseUrlOf(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

function settingsOf(ctx: Context, config: Config): GatewaySettings {
  const ais: AiEntry[] = []
  for (const ai of config.ais) {
    const name = ai.name.trim()
    if (ais.some(entry => entry.name === name)) {
      ctx.logger('ai-gateway').warn(`two AIs are named ${name}, the second is left out`)
      continue
    }
    ais.push({ ...ai, name, baseUrl: baseUrlOf(ai.baseUrl), apiKey: ai.apiKey.trim(), model: ai.model.trim() })
  }
  return { ais, default: config.default.trim() }
}

export function apply(ctx: Context, config: Config) {
  const settings: GatewayState = { current: settingsOf(ctx, config) }
  // A change of settings applies in place: restarting the service would restart every plugin using it
  ctx.on('internal/update', (next: Config) => {
    settings.current = settingsOf(ctx, next)
  })
  ctx.plugin(AiGatewayService, settings)
  ctx.inject(['webuiServer', 'ai'], (ctx) => {
    const gateway = ctx.ai as AiGatewayService
    ctx.webuiServer.route('/api/ai-gateway', { fetch: request => handle(gateway, request) })
  })
}

/** The API of the plugin's WebUI module: the AIs for the `ai` field and the settings page, and a test call */
export async function handle(gateway: AiGatewayService, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname
  if (path === '/api/ai-gateway/ais' && request.method === 'GET') {
    const ais = gateway.list().map(ai => ({ ...ai, ...gateway.stats.get(ai.name) }))
    return Response.json({ success: true, data: { default: gateway.defaultName() ?? '', ais } })
  }
  if (path === '/api/ai-gateway/test' && request.method === 'POST') {
    const { ai } = await request.json().catch(() => ({})) as { ai?: unknown }
    if (typeof ai !== 'string' || !ai) return Response.json({ success: false, message: 'ai is required' }, { status: 400 })
    const started = Date.now()
    try {
      const result = await gateway.chat('只回复两个字母：OK', { ai })
      return Response.json({ success: true, data: { ok: true, latency: Date.now() - started, model: result.model, text: result.text.slice(0, 200) } })
    } catch (e) {
      const error = e as AiError
      return Response.json({ success: true, data: { ok: false, latency: Date.now() - started, kind: error.kind, error: error.message } })
    }
  }
  return Response.json({ success: false, message: 'not found' }, { status: 404 })
}
