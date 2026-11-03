import type { AiGateway } from 'luckylillia-plugin-ai-gateway'
import type { Image } from './image.js'

export type Verdict = 'ai' | 'real' | 'unsure'

export interface VisionResult {
  verdict: Verdict
  /** 0-100 */
  confidence: number
  reasons: string[]
  /** The model's own words, when they hold no JSON */
  raw?: string
  /** As the provider names it */
  model: string
}

const SYSTEM = '你是数字图像取证专家，只输出 JSON，不写任何解释性前后缀。'

const PROMPT = `判断这张图片是否由 AI 生成（含 AI 绘画和 AI 大幅修图）。

依次检查：手指数量与关节走向；画面内文字 / 招牌 / logo 是否可读；物体边缘与背景的衔接是否有融化或糊成一团；
光影方向和反射是否自洽；皮肤 / 材质是否过度平滑或出现重复纹理；透视与结构是否成立；细小配件（首饰 / 眼镜腿 / 栏杆）有没有断续。

只输出如下 JSON：
{"verdict":"ai|real|unsure","confidence":0-100,"reasons":["中文短句，指出具体位置和现象","最多 3 条"]}

判不准就给 unsure，不要硬猜。`

/** Models like to wrap the JSON in a code fence or a greeting: take the first object */
function parse(text: string): Omit<VisionResult, 'model'> | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return
  try {
    const value = JSON.parse(match[0])
    const verdict: Verdict = value.verdict === 'ai' || value.verdict === 'real' ? value.verdict : 'unsure'
    const confidence = Math.max(0, Math.min(100, Number(value.confidence) || 0))
    const reasons = (Array.isArray(value.reasons) ? value.reasons : [])
      .map((reason: unknown) => String(reason).trim())
      .filter(Boolean)
      .slice(0, 3)
    return { verdict, confidence, reasons }
  } catch {
    return undefined
  }
}

/** A guess from the picture itself, for what carries no watermark; undefined when the model says nothing */
export async function judgeByVision(ai: AiGateway, options: { ai: string; model: string }, image: Image): Promise<VisionResult | undefined> {
  const result = await ai.chat([
    { role: 'system', content: SYSTEM },
    // The image goes as data: QQ image links expire and refuse other sites, so the model could not fetch them
    { role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image', data: image.data, mime: image.type }] },
  ], { ai: options.ai, model: options.model || undefined, temperature: 0 })
  const text = result.text.trim()
  if (!text) return
  return { ...parse(text) ?? { verdict: 'unsure', confidence: 0, reasons: [], raw: text.slice(0, 200) }, model: result.model }
}
