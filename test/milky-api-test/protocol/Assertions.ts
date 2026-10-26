import { MilkyResponse } from '../protocol/ApiClient.js'

export class AssertionError extends Error {
  constructor(message: string, public readonly actual?: unknown, public readonly expected?: unknown) {
    super(message)
    this.name = 'AssertionError'
  }
}

export class Assertions {
  /** status === 'ok' && retcode === 0 */
  static assertSuccess(res: MilkyResponse, action?: string): void {
    if (res.status !== 'ok' || res.retcode !== 0) {
      throw new AssertionError(
        `Milky API call failed${action ? ` for "${action}"` : ''}: retcode=${res.retcode} message=${res.message ?? ''}`,
        res,
        { status: 'ok', retcode: 0 },
      )
    }
  }

  static assertDefined<T>(value: T, name = 'value'): asserts value is NonNullable<T> {
    if (value === undefined || value === null) {
      throw new AssertionError(`expected ${name} to be defined, got ${String(value)}`, value, '<defined>')
    }
  }

  /** 不要求非空 */
  static assertHasFields(obj: any, fields: string[], objName = 'object'): void {
    if (obj == null) {
      throw new AssertionError(`expected ${objName} to be defined, got ${String(obj)}`, obj, '<object>')
    }
    const missing = fields.filter(f => !(f in obj))
    if (missing.length) {
      throw new AssertionError(`${objName} missing fields: ${missing.join(', ')}`, obj, fields)
    }
  }

  static assertEqual<T>(actual: T, expected: T, name = 'value'): void {
    if (actual !== expected) {
      throw new AssertionError(`expected ${name} === ${String(expected)}, got ${String(actual)}`, actual, expected)
    }
  }
}
