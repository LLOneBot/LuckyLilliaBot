import { Context, h, Schema, Session } from '@luckylillia/plugin-sdk'
import type { AiError } from 'luckylillia-plugin-ai-gateway'
import { download, Image } from './image.js'
import { checkProvenance } from './provenance.js'
import { judgeByVision, VisionResult } from './vision.js'

export const name = 'aicheck'
export const inject = ['bots', 'ai', 'http']

export interface Config {
  trigger: string
  cooldown: number
  provenance: false | { ai: string }
  vision: false | { ai: string; model: string }
}

export const Config: Schema<Config> = Schema.object({
  trigger: Schema.string().default('ai吗').description('触发词，不分大小写：对着图片回复它，或者它后面直接带图'),
  cooldown: Schema.natural().role('ms').default(10_000).description('同一个群（或私聊）两次检测至少隔多久'),
  provenance: Schema.union([
    Schema.const(false).description('不查'),
    Schema.object({
      ai: Schema.string().role('ai').default('')
        .description('用 AI 网关里的哪个 AI：必须是 OpenAI 官方的地址（https://api.openai.com/v1）和 Key，中转不支持这个接口'),
    }).description('查'),
  ]).default(false).description('OpenAI 水印检测：查图片是不是 ChatGPT 生成的，结论确定，但只认 OpenAI 自家的图，国内要走代理才连得上'),
  vision: Schema.union([
    Schema.const(false).description('不用'),
    Schema.object({
      ai: Schema.string().role('ai').default('').description('用 AI 网关里的哪个 AI：要能看图；国内直连的（比如 DeepSeek）更稳'),
      model: Schema.string().default('').description('换个模型，留空用 AI 网关里给它设的。小模型判图不准'),
    }).description('用'),
  ]).default({ ai: '', model: '' }).description('看图判断：让能看图的 AI 从画面里找 AI 生成的破绽。只是推测，按图片计费'),
})

interface Picked {
  url: string
  /** The message the image is in, which the answer quotes */
  messageId?: string
}

const VERDICT_TEXT: Record<VisionResult['verdict'], string> = {
  ai: '疑似 AI 生成',
  real: '更像真实拍摄 / 人工创作',
  unsure: '看不出来',
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('aicheck')
  const trigger = config.trigger.trim().toLowerCase()
  const lastCheck = new Map<string, number>()

  function cooling(key: string): boolean {
    if (!config.cooldown) return false
    const now = Date.now()
    const last = lastCheck.get(key)
    if (last !== undefined && now - last < config.cooldown) return true
    lastCheck.set(key, now)
    for (const [other, at] of lastCheck) if (now - at >= config.cooldown) lastCheck.delete(other)
    return false
  }

  async function verdict(image: Image): Promise<string> {
    // Whether a check ran to the end without finding anything, and what failed on the way
    let checked = false
    let failure: unknown
    if (config.provenance) {
      try {
        const answer = await checkProvenance(ctx.ai, config.provenance.ai, image)
        if (answer.results?.some(result => result.outcome === 'detected')) return '图片是 ChatGPT 制作。'
        checked = true
      } catch (e) {
        failure = e
        logger.warn('watermark check failed:', (e as Error).message)
      }
    }
    if (config.vision) {
      try {
        const result = await judgeByVision(ctx.ai, config.vision, image)
        if (result) return formatVision(result)
        checked = true
      } catch (e) {
        failure ??= e
        logger.warn('vision check failed:', (e as Error).message)
      }
    }
    if (checked) return '没看出 AI 制作的痕迹。'
    if (failure) return describeFailure(failure)
    return '还没有打开任何检测，请在 AICheck 插件的设置里打开。'
  }

  ctx.on('bot/message', async (session, next) => {
    if (!trigger || !textOf(session).toLowerCase().startsWith(trigger)) return next()
    const picked = pickImage(session)
    // A message starting with the word is not always meant for this plugin
    if (!picked) return next()
    if (cooling(`${session.platform}:${session.channelId}`)) return next()
    // Quote the message the image is in: with several images in a busy group, that says which one it was about
    const reply = (text: string) => session.send(picked.messageId ? [h('quote', { id: picked.messageId }), h.text(text)] : h.text(text))
    let image: Image
    try {
      image = await download(ctx, picked.url)
    } catch (e) {
      logger.warn('cannot download the image:', (e as Error).message)
      await reply('图片下载失败，请稍后再试。')
      return
    }
    await reply(await verdict(image))
  })
}

/** Only the words of the message itself: the @ of someone or of the bot may come first, the quoted message not at all */
function textOf(session: Session): string {
  return session.elements.filter(element => element.type === 'text').map(element => String(element.attrs.content ?? '')).join('').trim()
}

/** An image of the message itself first, then one of the message it quotes */
function pickImage(session: Session): Picked | undefined {
  const own = h.select(session.elements.filter(element => element.type !== 'quote'), 'img')[0]
  if (own) return { url: String(own.attrs.src ?? own.attrs.url), messageId: session.messageId }
  const quote = session.elements.find(element => element.type === 'quote')
  const quoted = quote && h.select(quote.children, 'img')[0]
  if (quoted) return { url: String(quoted.attrs.src ?? quoted.attrs.url), messageId: quote.attrs.id || session.messageId }
}

function formatVision(result: VisionResult): string {
  if (result.raw) return `${result.model} 判断：${result.raw}`
  const head = result.confidence ? `${VERDICT_TEXT[result.verdict]}（置信度 ${result.confidence}%）` : VERDICT_TEXT[result.verdict]
  return [`${result.model} 判断：${head}`, ...result.reasons.map(reason => `- ${reason}`)].join('\n')
}

/** What group members can act on; the details go to the log */
function describeFailure(error: unknown): string {
  switch ((error as Partial<AiError>)?.kind) {
    case 'rate-limit': return '检测请求过于频繁，请稍后再试。'
    case 'quota': return 'AI 服务的余额或额度用完了。'
    case 'auth': return 'API Key 无效或没有权限。'
    case 'network':
    case 'timeout': return '连不上检测服务，请检查网络或代理设置。'
    case 'config': return 'AI 网关里没有设置好要用的 AI。'
    default: return '检测失败，请稍后再试。'
  }
}
