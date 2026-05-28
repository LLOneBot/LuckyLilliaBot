import { MilkyResponse } from '../protocol/ApiClient.js'

export class AssertionError extends Error {
  constructor(message: string, public readonly actual?: unknown, public readonly expected?: unknown) {
    super(message)
    this.name = 'AssertionError'
  }
}

export class Assertions {
  /** 断言 Milky 调用成功（status === 'ok' && retcode === 0），失败时抛出包含 message 的错误。 */
  static assertSuccess(res: MilkyResponse, action?: string): void {
    if (res.status !== 'ok' || res.retcode !== 0) {
      throw new AssertionError(
        `Milky API call failed${action ? ` for "${action}"` : ''}: retcode=${res.retcode} message=${res.message ?? ''}`,
        res,
        { status: 'ok', retcode: 0 },
      )
    }
  }
}
