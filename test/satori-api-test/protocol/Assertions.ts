import { SatoriResponse } from './ApiClient.js'

export class AssertionError extends Error {
  constructor(message: string, public readonly actual?: unknown, public readonly expected?: unknown) {
    super(message)
    this.name = 'AssertionError'
  }
}

export class Assertions {
  /** 断言 satori 调用成功（HTTP 200，没异常）。失败时抛出包含 status / message 的错误。 */
  static assertSuccess(res: SatoriResponse, action?: string): void {
    if (!res.ok) {
      throw new AssertionError(
        `Satori API call failed${action ? ` for "${action}"` : ''}: status=${res.status} message=${res.message ?? ''}`,
        res,
        { ok: true },
      )
    }
  }

  /** 断言值不为 undefined / null。 */
  static assertDefined<T>(value: T, name = 'value'): asserts value is NonNullable<T> {
    if (value === undefined || value === null) {
      throw new AssertionError(`expected ${name} to be defined, got ${String(value)}`, value, '<defined>')
    }
  }

  /** 断言对象拥有指定字段（不要求非空）。 */
  static assertHasFields(obj: any, fields: string[], objName = 'object'): void {
    if (obj == null) {
      throw new AssertionError(`expected ${objName} to be defined, got ${String(obj)}`, obj, '<object>')
    }
    const missing = fields.filter(f => !(f in obj))
    if (missing.length) {
      throw new AssertionError(`${objName} missing fields: ${missing.join(', ')}`, obj, fields)
    }
  }

  /** 断言两个值严格相等。 */
  static assertEqual<T>(actual: T, expected: T, name = 'value'): void {
    if (actual !== expected) {
      throw new AssertionError(`expected ${name} === ${String(expected)}, got ${String(actual)}`, actual, expected)
    }
  }
}
