import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  method: string
  args: any[]
}

export default class Debug extends BaseAction<Payload, any> {
  actionName = ActionName.Debug

  protected async _handle(payload: Payload): Promise<any> {
    this.ctx.logger.info('debug call ntqq api', payload)
    const { ntMsgApi, ntFileApi, ntFileCacheApi, ntFriendApi, ntGroupApi, ntUserApi, ntWindowApi } = this.ctx
    const ntqqApi = [ntMsgApi, ntFriendApi, ntGroupApi, ntUserApi, ntFileApi, ntFileCacheApi, ntWindowApi]
    for (const ntqqApiClass of ntqqApi) {
      const method = ntqqApiClass[payload.method as keyof typeof ntqqApiClass]
      if (method && method instanceof Function) {
        const result = method.apply(ntqqApiClass, payload.args)
        if (method.constructor.name === 'AsyncFunction') {
          return await result
        }
        return result
      }
    }
    throw `${payload.method}方法 不存在`
  }
}
