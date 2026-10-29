import { ActionName } from './types'
import { OB11Response } from './OB11Response'
import { OB11Return } from '../types'
import { Context } from 'cordis'
import { ParseMessageConfig } from '../types'
import type Adapter from '../adapter'
import z from 'schemastery'

// cordis ctx.parallel rejects with a message-less AggregateError when a listener fails
function errorMessage(e: unknown): string {
  if (e instanceof AggregateError) return e.errors.map(errorMessage).join('; ')
  return (e as Error).message
}

abstract class BaseAction<PayloadType, ReturnDataType> {
  abstract actionName: ActionName
  protected ctx: Context
  payloadSchema?: z<PayloadType>

  constructor(protected adapter: Adapter) {
    this.ctx = adapter.ctx
  }

  public async handle(payload: PayloadType, config: ParseMessageConfig): Promise<OB11Return<ReturnDataType | null>> {
    let params: PayloadType
    try {
      params = this.payloadSchema ? new this.payloadSchema(payload) : payload
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error(errorMessage(e), 400)
    }
    try {
      const resData = await this._handle(params, config)
      return OB11Response.ok(resData)
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error(errorMessage(e), 200)
    }
  }

  public async websocketHandle(payload: PayloadType, echo: unknown, config: ParseMessageConfig): Promise<OB11Return<ReturnDataType | null>> {
    let params: PayloadType
    try {
      params = this.payloadSchema ? new this.payloadSchema(payload) : payload
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error(errorMessage(e), 1400, echo)
    }
    try {
      const resData = await this._handle(params, config)
      return OB11Response.ok(resData, echo)
    } catch (e) {
      this.ctx.logger.error('发生错误', e)
      return OB11Response.error(errorMessage(e), 1200, echo)
    }
  }

  protected abstract _handle(payload: PayloadType, config: ParseMessageConfig): Promise<ReturnDataType>
}

export { BaseAction, z as Schema }
