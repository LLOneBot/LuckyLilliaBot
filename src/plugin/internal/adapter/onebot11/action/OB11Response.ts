import { OB11Return } from '../types'
import { isNullable } from 'cosmokit'

export class OB11Response {
  static res<T>(data: T, status: string, retcode: number, message: string = ''): OB11Return<T> {
    return {
      status: status,
      retcode: retcode,
      data: data,
      message: message,
      wording: message,
      echo: undefined,
    }
  }

  static ok<T>(data: T, echo?: unknown) {
    const res = OB11Response.res<T>(data, 'ok', 0)
    if (!isNullable(echo)) {
      res.echo = echo
    }
    return res
  }

  static error(err: string, retcode: number, echo?: unknown) {
    const res = OB11Response.res(null, 'failed', retcode, err)
    if (!isNullable(echo)) {
      res.echo = echo
    }
    return res
  }
}
