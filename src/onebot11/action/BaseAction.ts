import { ActionName } from './types'
import { OB11Response } from './OB11Response'
import { OB11Return } from '../types'
import { Context, Schema } from 'cordis'
import type Adapter from '../adapter'

abstract class BaseAction<PayloadType, ReturnDataType> {
  abstract actionName: ActionName
  protected ctx: Context
  payloadSchema?: Schema<PayloadType>

  constructor(protected adapter: Adapter) {
    this.ctx = adapter.ctx
  }

  public async handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
    let params: PayloadType
    try {
      params = this.payloadSchema ? new this.payloadSchema(payload) : payload
    } catch (e) {
      return OB11Response.error((e as Error).message, 400)
    }
    try {
      const resData = await this._handle(params)
      return OB11Response.ok(resData)
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error((e as Error).message, 200)
    }
  }

  public async websocketHandle(payload: PayloadType, echo: unknown): Promise<OB11Return<ReturnDataType | null>> {
    let params: PayloadType
    try {
      params = this.payloadSchema ? new this.payloadSchema(payload) : payload
    } catch (e) {
      return OB11Response.error((e as Error).message, 1400)
    }
    try {
      const resData = await this._handle(params)
      return OB11Response.ok(resData, echo)
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error((e as Error).message, 1200, echo)
    }
  }

  protected abstract _handle(payload: PayloadType): Promise<ReturnDataType>
}

export { BaseAction, Schema }
