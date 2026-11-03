// What other plugins see of the gateway: `inject: ['ai']`, then `ctx.ai`. They import these types only
// (`import type ... from 'luckylillia-plugin-ai-gateway'`), never the code.

export interface AiInfo {
  /** What a plugin passes as `ai`, and what a config field with `.role('ai')` stores */
  name: string
  model: string
  /** The user marked it as taking images */
  vision: boolean
  /** Goes through the builtin proxy (「代理」) when one is set */
  proxy: boolean
}

export type ChatPart =
  | { type: 'text'; text: string }
  /** An http(s) or data: URL. QQ image links expire and refuse other sites, so send QQ images as data */
  | { type: 'image'; url: string }
  /** Sent along as a data: URL; the type is read from the bytes when left out */
  | { type: 'image'; data: ArrayBuffer | Uint8Array; mime?: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatPart[]
}

export interface ChatOptions {
  /** By name; the default AI when left out or empty */
  ai?: string
  /** Instead of the AI's own model */
  model?: string
  /** Left out for models that refuse it (OpenAI's reasoning models) */
  temperature?: number
  /** Sent as `max_tokens`, or `max_completion_tokens` to models that want that */
  maxTokens?: number
  /** Milliseconds; the AI's own timeout when left out. For `stream()`, the longest wait for the next piece */
  timeout?: number
  signal?: AbortSignal
  /** More fields of the request body, over the ones the user set for the AI */
  body?: Record<string, unknown>
}

export interface ChatResult {
  /** The answer, without the thinking some models put before it */
  text: string
  ai: string
  /** As the provider names it in the answer */
  model: string
  usage?: { input: number; output: number }
  finishReason?: string
  /** The model's thinking: `reasoning_content`, or a `<think>` block it opened its answer with */
  reasoning?: string
  /** The provider's whole answer, for what the rest leaves out (tool calls, refusals) */
  raw: Record<string, any>
}

/**
 * - `config`: no such AI, none set up, or an address that is not http(s)
 * - `auth`: 401 / 403, the key is wrong or lacks access
 * - `quota`: no balance or quota left (402, OpenAI's `insufficient_quota`...)
 * - `rate-limit`: 429
 * - `request`: another 4xx, e.g. an unknown model or an image the model cannot take
 * - `server`: 5xx
 * - `network`: no connection, e.g. a blocked address
 * - `timeout`
 * - `response`: an answer the gateway cannot read
 */
export type AiErrorKind = 'config' | 'auth' | 'quota' | 'rate-limit' | 'request' | 'server' | 'network' | 'timeout' | 'response'

/** What the gateway throws; tell the cases apart by `kind` (`instanceof` needs the code, which plugins do not import) */
export interface AiError extends Error {
  name: 'AiError'
  kind: AiErrorKind
  ai?: string
  /** The HTTP status, for an answer that was not a success */
  status?: number
  /** The provider's own error code (`context_length_exceeded`...), or for `network` the connection's (`ECONNREFUSED`) */
  code?: string
}

export interface AiGateway {
  /** The AIs the user set up, keys left out */
  list(): AiInfo[]
  /** One by name, the default one for no name; undefined when there is none */
  get(name?: string): AiInfo | undefined
  /** A string is one user message */
  chat(input: string | ChatMessage[], options?: ChatOptions): Promise<ChatResult>
  /** The reply as it is written, piece by piece, without the thinking some models put before it */
  stream(input: string | ChatMessage[], options?: ChatOptions): AsyncIterable<string>
  /**
   * Any other call to the AI's API, its key and headers in place: `path` goes under the AI's address, e.g.
   * `/models`. Throws AiError for an answer that is not a success.
   */
  request(ai: string | undefined, path: string, init?: RequestInit & { timeout?: number }): Promise<Response>
}

declare module 'cordis' {
  interface Context {
    ai: AiGateway
  }
}
