import type { Context } from 'cordis'
import { z, ZodType } from 'zod'

export interface MilkyApiOkResponse<T> {
  status: 'ok'
  retcode: 0
  data: T
}

export interface MilkyApiFailedResponse {
  status: 'failed'
  retcode: number
  message: string
}

export type MilkyApiResponse<T = unknown> = MilkyApiOkResponse<T> | MilkyApiFailedResponse

export interface MilkyApiHandler {
  endpoint: string
  validator: ZodType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: Context, payload: any) => Promise<MilkyApiResponse<unknown>>
}

export function defineApi<Z extends ZodType, OZ extends ZodType>(
  endpoint: string,
  validator: Z,
  outputTypeInfo: OZ,
  handler: (ctx: Context, payload: z.infer<Z>) => Promise<MilkyApiResponse<z.infer<OZ>>>,
): MilkyApiHandler {
  return { endpoint, validator, handler }
}

export function Ok<OT>(data: OT): MilkyApiOkResponse<OT> {
  return { status: 'ok', retcode: 0, data }
}

export function Failed(retcode: number, message: string): MilkyApiFailedResponse {
  return { status: 'failed', retcode, message }
}

function encodeZodIssues(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `[${issue.code}] ${issue.path.join('/')}: ${issue.message}`).join(' ')
}

export class MilkyApiCollection {
  readonly apiMap = new Map<string, MilkyApiHandler>()

  constructor(private ctx: Context, apiList: MilkyApiHandler[]) {
    apiList.forEach((api) => {
      if (this.apiMap.has(api.endpoint)) {
        throw new Error(`API endpoint "${api.endpoint}" is already defined.`)
      }
      this.apiMap.set(api.endpoint, api)
    })
  }

  /**
   * Checks if the API endpoint is defined.
   */
  hasApi(endpoint: string) {
    return this.apiMap.has(endpoint)
  }

  async handle(endpoint: string, payload: unknown): Promise<MilkyApiResponse> {
    const api = this.apiMap.get(endpoint)!
    try {
      const parsedPayload = api.validator.safeParse(payload)
      if (!parsedPayload.success) {
        return Failed(-400, 'Invalid payload: ' + encodeZodIssues(parsedPayload.error.issues))
      }
      const response = await api.handler(this.ctx, parsedPayload.data)
      if (response.status === 'failed') {
        this.ctx.logger.warn(
          'Milky',
          `Error while handling API /${endpoint}: ${response.message}`,
        )
      }
      return response
    } catch (e) {
      this.ctx.logger.warn(
        'Milky',
        `Error while handling API /${endpoint}: ${e instanceof Error ? e.message + '\n' + e.stack : String(e)
        }`,
      )
      if (e instanceof z.ZodError) {
        return Failed(-400, 'Zod error: ' + encodeZodIssues(e.issues))
      }
      return Failed(500, 'Internal error: ' + (e instanceof Error ? e.message : String(e)))
    }
  }
}
