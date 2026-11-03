import { Context, Service } from '@luckylillia/plugin-sdk'
import type {
  AiError as AiErrorShape, AiErrorKind, AiGateway as AiGatewayApi, AiInfo, ChatMessage, ChatOptions, ChatPart, ChatResult,
} from './types.js'

export interface AiEntry {
  name: string
  /** Up to the version, without a trailing slash: `https://api.openai.com/v1` */
  baseUrl: string
  apiKey: string
  model: string
  vision: boolean
  proxy: boolean
  timeout: number
  headers: Record<string, string>
  body: Record<string, unknown>
}

export interface GatewaySettings {
  ais: AiEntry[]
  /** Name of the default AI; the first one when it names none */
  default: string
}

/** Held by the entry, which puts new settings in */
export interface GatewayState {
  current: GatewaySettings
}

export interface AiStats {
  calls: number
  failures: number
  /** Milliseconds until the answer began, last time */
  latency?: number
  lastError?: { at: number; message: string }
}

interface ErrorDetails {
  ai?: string
  status?: number
  code?: string
  /** The request field the provider refused (OpenAI's `error.param`) */
  param?: string
}

export class AiError extends Error implements AiErrorShape {
  readonly name = 'AiError' as const
  readonly ai?: string
  readonly status?: number
  readonly code?: string
  readonly param?: string

  constructor(message: string, readonly kind: AiErrorKind, details: ErrorDetails = {}) {
    super(message)
    this.ai = details.ai
    this.status = details.status
    this.code = details.code
    this.param = details.param
  }
}

const CHAT = '/chat/completions'

/**
 * `ctx.ai`. The settings come in a holder its entry updates in place, so a change of them reaches the plugins using
 * the gateway without restarting them. Called through ctx it runs on a shadow: mutate fields, never reassign them.
 */
export class AiGatewayService extends Service implements AiGatewayApi {
  static inject = ['http']

  readonly stats = new Map<string, AiStats>()

  constructor(ctx: Context, private readonly settings: GatewayState) {
    super(ctx, 'ai')
  }

  list(): AiInfo[] {
    return this.settings.current.ais.map(info)
  }

  get(name?: string): AiInfo | undefined {
    const entry = this.find(name)
    return entry && info(entry)
  }

  /** The name the default AI goes by, if there is one */
  defaultName(): string | undefined {
    return this.find()?.name
  }

  async chat(input: string | ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const entry = this.require(options.ai)
    return this.track(entry, options.signal, async () => {
      const body = requestBody(entry, input, options)
      const signal = withSignal(AbortSignal.timeout(options.timeout ?? entry.timeout), options.signal)
      const response = await this.complete(entry, body, signal, options.signal)
      return answerOf(entry, await readJson(response, entry, options.signal), String(body.model))
    })
  }

  async *stream(input: string | ChatMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    const entry = this.require(options.ai)
    this.statsOf(entry.name).calls++
    // A long answer takes minutes: the timeout is for the wait between pieces
    const idle = new IdleTimeout(options.timeout ?? entry.timeout)
    const thinking = new ThinkingFilter()
    try {
      const body: Record<string, unknown> = { ...requestBody(entry, input, options), stream: true }
      const response = await this.complete(entry, body, withSignal(idle.signal, options.signal), options.signal)
      // Some providers ignore `stream` and answer at once
      if (response.headers.get('content-type')?.includes('application/json')) {
        const { text } = answerOf(entry, await readJson(response, entry, options.signal), String(body.model))
        if (text) yield text
        return
      }
      if (!response.body) throw new AiError(`${entry.name} answered without a body`, 'response', { ai: entry.name })
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      try {
        for await (const chunk of response.body) {
          idle.touch()
          buffer += decoder.decode(chunk, { stream: true })
          for (let end = buffer.indexOf('\n'); end >= 0 && !done; end = buffer.indexOf('\n')) {
            const line = buffer.slice(0, end).trim()
            buffer = buffer.slice(end + 1)
            // Server-sent events: only `data:` lines carry the chunks; comments and `event:` lines do not
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              done = true
              continue
            }
            let json: Record<string, any>
            try {
              json = JSON.parse(data)
            } catch {
              continue
            }
            if (json.error) throw new AiError(`${entry.name}: ${errorMessage(json)}`, 'response', { ai: entry.name, code: codeOf(json.error) })
            const piece = textOf(json.choices?.[0]?.delta?.content)
            const shown = piece && thinking.push(piece)
            if (shown) yield shown
          }
          if (done) break
        }
      } catch (e) {
        throw e instanceof AiError ? e : transportError(e, entry, options.signal)
      }
      const rest = thinking.end()
      if (rest) yield rest
    } catch (e) {
      this.failed(entry, e, options.signal)
      throw e
    } finally {
      idle.clear()
    }
  }

  async request(ai: string | undefined, path: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
    const entry = this.require(ai)
    const { timeout, ...rest } = init
    const caller = rest.signal ?? undefined
    return this.track(entry, caller, () => {
      const signal = withSignal(AbortSignal.timeout(timeout ?? entry.timeout), caller)
      return this.call(entry, path.startsWith('/') ? path : `/${path}`, { ...rest, signal }, caller)
    })
  }

  private find(name?: string): AiEntry | undefined {
    const { ais, default: preferred } = this.settings.current
    if (name) return ais.find(entry => entry.name === name)
    return ais.find(entry => entry.name === preferred) ?? ais[0]
  }

  private require(name?: string): AiEntry {
    const entry = this.find(name)
    if (entry) return entry
    throw new AiError(name ? `no AI named ${name} in the AI gateway` : 'no AI is set up in the AI gateway', 'config', { ai: name || undefined })
  }

  private statsOf(name: string): AiStats {
    let stats = this.stats.get(name)
    if (!stats) this.stats.set(name, stats = { calls: 0, failures: 0 })
    return stats
  }

  private async track<T>(entry: AiEntry, callerSignal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    this.statsOf(entry.name).calls++
    try {
      return await task()
    } catch (e) {
      this.failed(entry, e, callerSignal)
      throw e
    }
  }

  /** The caller's own abort is no failure of the AI */
  private failed(entry: AiEntry, error: unknown, callerSignal?: AbortSignal) {
    if (callerSignal?.aborted) return
    const stats = this.statsOf(entry.name)
    stats.failures++
    stats.lastError = { at: Date.now(), message: error instanceof Error ? error.message : String(error) }
  }

  /**
   * The chat completion, sent again when another try may go through: without a field the model refuses (OpenAI's
   * reasoning models take no temperature and want max_completion_tokens), and once after a 5xx or a dropped
   * connection. A timeout is not tried again: that would double the wait.
   */
  private async complete(entry: AiEntry, body: Record<string, unknown>, signal: AbortSignal, callerSignal?: AbortSignal): Promise<Response> {
    let adjusted = 0
    let retried = false
    for (;;) {
      try {
        return await this.call(entry, CHAT, { ...post(body), signal }, callerSignal)
      } catch (e) {
        if (!(e instanceof AiError)) throw e
        const next = adjusted < 2 ? withoutRefused(body, e) : undefined
        if (next) {
          body = next
          adjusted++
          continue
        }
        if (retried || !transient(e)) throw e
        retried = true
        try {
          await pause(1000, signal)
        } catch (reason) {
          throw transportError(reason, entry, callerSignal)
        }
      }
    }
  }

  private async call(entry: AiEntry, path: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
    // `api.openai.com/v1`, the usual slip, does not parse as an address at all
    if (!/^https?:\/\//i.test(entry.baseUrl)) {
      throw new AiError(`the address of ${entry.name} should start with http:// or https://: ${entry.baseUrl}`, 'config', { ai: entry.name })
    }
    const started = Date.now()
    const headers = new Headers(init.headers)
    for (const [key, value] of Object.entries(entry.headers)) headers.set(key, value)
    // Some providers take the key in a header of their own (Azure's api-key): the user leaves the key empty then
    if (entry.apiKey && !headers.has('authorization')) headers.set('authorization', `Bearer ${entry.apiKey}`)
    let response: Response
    try {
      // Through the proxy of the builtin entry「代理」, if it is on and has one; `''` goes direct
      response = await this.ctx.http.fetch(`${entry.baseUrl}${path}`, { ...init, headers }, entry.proxy ? undefined : { proxyAgent: '' })
    } catch (e) {
      throw transportError(e, entry, callerSignal)
    }
    if (!response.ok) throw await answerError(entry, response)
    this.statsOf(entry.name).latency = Date.now() - started
    return response
  }
}

function info(entry: AiEntry): AiInfo {
  return { name: entry.name, model: entry.model, vision: entry.vision, proxy: entry.proxy }
}

function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

function withSignal(signal: AbortSignal, callerSignal?: AbortSignal): AbortSignal {
  return callerSignal ? AbortSignal.any([signal, callerSignal]) : signal
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Aborts after `ms` without progress; touch() starts the wait over */
class IdleTimeout {
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout>

  constructor(private readonly ms: number) {
    this.timer = this.arm()
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  touch() {
    clearTimeout(this.timer)
    this.timer = this.arm()
  }

  clear() {
    clearTimeout(this.timer)
  }

  private arm() {
    const timer = setTimeout(() => this.controller.abort(new DOMException(`nothing came for ${this.ms} ms`, 'TimeoutError')), this.ms)
    timer.unref?.()
    return timer
  }
}

const OPEN = '<think>'
const CLOSE = '</think>'

/** Some models (served by Ollama, among others) think aloud at the start of the answer itself */
function splitThinking(content: string): { text: string; thought?: string } {
  const match = content.match(/^\s*<think>([\s\S]*?)(?:<\/think>\s*|$)/)
  if (!match) return { text: content }
  return { text: content.slice(match[0].length), thought: match[1].trim() || undefined }
}

/** splitThinking() for a stream: holds back the start until it knows, then drops a <think> block */
class ThinkingFilter {
  private state: 'start' | 'thinking' | 'answer' = 'start'
  private held = ''

  push(piece: string): string {
    if (this.state === 'answer') return piece
    this.held += piece
    if (this.state === 'start') {
      const head = this.held.trimStart()
      if (head.length < OPEN.length && OPEN.startsWith(head)) return ''
      if (!head.startsWith(OPEN)) return this.release()
      this.state = 'thinking'
      this.held = head.slice(OPEN.length)
    }
    const end = this.held.indexOf(CLOSE)
    if (end < 0) {
      // Only what may be the start of the closing tag is kept
      this.held = this.held.slice(-(CLOSE.length - 1))
      return ''
    }
    const rest = this.held.slice(end + CLOSE.length).trimStart()
    this.state = 'answer'
    this.held = ''
    return rest
  }

  /** What is held back when the stream ends: the whole answer, when it was shorter than `<think>` */
  end(): string {
    return this.state === 'start' ? this.release() : ''
  }

  private release(): string {
    const held = this.held
    this.state = 'answer'
    this.held = ''
    return held
  }
}

async function readJson(response: Response, entry: AiEntry, callerSignal?: AbortSignal): Promise<Record<string, any> | undefined> {
  try {
    return await response.json()
  } catch (e) {
    // The timeout runs on while the answer comes in
    if ((e as Error)?.name !== 'SyntaxError') throw transportError(e, entry, callerSignal)
  }
}

function answerOf(entry: AiEntry, data: Record<string, any> | undefined, model: string): ChatResult {
  const choice = data?.choices?.[0]
  const content = textOf(choice?.message?.content)
  if (!data || content === undefined) {
    const finish = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : ''
    throw new AiError(`${entry.name} gave no message in its answer${finish}`, 'response', { ai: entry.name })
  }
  const { text, thought } = splitThinking(content)
  // DeepSeek and others answer with the thinking apart
  const reasoning = typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content
    ? choice.message.reasoning_content
    : thought
  return {
    text,
    ai: entry.name,
    model: typeof data.model === 'string' && data.model ? data.model : model,
    usage: data.usage ? { input: Number(data.usage.prompt_tokens) || 0, output: Number(data.usage.completion_tokens) || 0 } : undefined,
    finishReason: choice.finish_reason ?? undefined,
    ...reasoning ? { reasoning } : {},
    raw: data,
  }
}

function requestBody(entry: AiEntry, input: string | ChatMessage[], options: ChatOptions): Record<string, unknown> {
  const messages = typeof input === 'string' ? [{ role: 'user', content: input } satisfies ChatMessage] : input
  return {
    ...entry.body,
    model: options.model || entry.model,
    messages: messages.map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : message.content.map(partOf),
    })),
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.body,
  }
}

/** Sampling fields some models refuse outright: their own values are the only ones they take */
const SAMPLING = ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty']

/** The body without the field a 400 names, or undefined when that is not something to fix this way */
function withoutRefused(body: Record<string, unknown>, error: AiError): Record<string, unknown> | undefined {
  if (error.status !== 400 || !error.param || !(error.param in body)) return
  const { [error.param]: value, ...rest } = body
  if (error.param === 'max_tokens') return { ...rest, max_completion_tokens: value }
  if (SAMPLING.includes(error.param)) return rest
}

const TRANSIENT_STATUS = [500, 502, 503, 504]
/** The connection dropped, so the request may not have reached the provider */
const DROPPED = ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']

function transient(error: AiError): boolean {
  if (error.kind === 'server') return TRANSIENT_STATUS.includes(error.status ?? 0)
  return error.kind === 'network' && DROPPED.includes(error.code ?? '')
}

function partOf(part: ChatPart) {
  if (part.type === 'text') return { type: 'text', text: part.text }
  const url = 'url' in part ? part.url : dataUrl(part.data, part.mime)
  return { type: 'image_url', image_url: { url } }
}

function dataUrl(data: ArrayBuffer | Uint8Array, mime?: string): string {
  const bytes = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data))
  return `data:${mime || sniff(bytes) || 'image/png'};base64,${bytes.toString('base64')}`
}

export function sniff(bytes: Uint8Array): string | undefined {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte)
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  if (starts(0x42, 0x4d)) return 'image/bmp'
}

/** A message's content: a string, or (some providers) a list of parts */
function textOf(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('')
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** OpenAI's `{ error: { message } }`, and the shapes others answer in */
function errorMessage(data: unknown): string {
  if (typeof data === 'string') return data.trim().slice(0, 300)
  const body = data as Record<string, any> | undefined
  const message = body?.error?.message ?? body?.error ?? body?.message ?? body?.msg
  return typeof message === 'string' ? message.slice(0, 300) : JSON.stringify(body ?? '').slice(0, 300)
}

/** OpenAI's `error.code`, else its `type`: `insufficient_quota`, `context_length_exceeded`... */
function codeOf(error: unknown): string | undefined {
  const { code, type } = (error && typeof error === 'object' ? error : {}) as Record<string, unknown>
  const value = code ?? type
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

async function answerError(entry: AiEntry, response: Response): Promise<AiError> {
  const text = await response.text().catch(() => '')
  const data = parseJson(text) as Record<string, any> | undefined
  const detail = errorMessage(data ?? text)
  const code = codeOf(data?.error)
  const param = typeof data?.error?.param === 'string' ? data.error.param : undefined
  const message = `${entry.name} answered ${response.status}${detail ? `: ${detail}` : ''}`
  return new AiError(message, kindOf(response.status, code, detail), { ai: entry.name, status: response.status, code, param })
}

/**
 * An empty balance, as the providers word it: DeepSeek answers 402, OpenAI 429 `insufficient_quota`, Kimi 429
 * `exceeded_current_quota_error`, Zhipu 429 "欠费", SiliconFlow 403 "balance is insufficient". Running into a
 * per-minute quota is a 429 of its own and stays a rate limit.
 */
const NO_BALANCE = /insufficient[ _]?(balance|funds|credit|quota)|balance (is )?(insufficient|not enough)|exceeded_current_quota|余额|欠费/i

function kindOf(status: number, code: string | undefined, message: string): AiErrorKind {
  if (status === 402 || ((status === 403 || status === 429) && NO_BALANCE.test(`${code ?? ''} ${message}`))) return 'quota'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate-limit'
  if (status >= 500) return 'server'
  return 'request'
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function transportError(error: unknown, entry: AiEntry, callerSignal?: AbortSignal): unknown {
  // The caller's own abort is theirs to handle
  if (callerSignal?.aborted) return callerSignal.reason
  if (error instanceof AiError) return error
  if ((error as Error)?.name === 'TimeoutError') return new AiError(`${entry.name} did not answer in time`, 'timeout', { ai: entry.name })
  // undici buries the cause (ECONNREFUSED, ENOTFOUND, ...) under "fetch failed"
  let cause = error as { message?: string; cause?: unknown; code?: string } | undefined
  while (cause?.cause) cause = cause.cause as typeof cause
  const code = (error as { code?: string })?.code ?? cause?.code
  const reason = code ?? cause?.message ?? String(error)
  return new AiError(`cannot reach ${entry.name} at ${originOf(entry.baseUrl)}: ${reason}`, 'network', { ai: entry.name, code })
}
