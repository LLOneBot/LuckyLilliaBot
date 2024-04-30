import { Response } from 'express'
import { OB11Response } from '../action/OB11Response'
import { HttpServerBase } from '../../common/server/http'
import { actionHandlers, actionMap } from '../action'
import { getConfigUtil } from '../../common/config'
import { postOB11Event } from './postOB11Event'
import { OB11HeartbeatEvent } from '../event/meta/OB11HeartbeatEvent'
import { selfInfo } from '../../common/data'

class OB11HTTPServer extends HttpServerBase {
  name = 'OneBot V11 server'

  handleFailed(res: Response, payload: any, e: any) {
    res.send(OB11Response.error(e.stack.toString(), 200))
  }

  protected listen(port: number) {
    if (getConfigUtil().getConfig().ob11.enableHttp) {
      super.listen(port)
    }
  }
}

export const ob11HTTPServer = new OB11HTTPServer()

setTimeout(() => {
  for (const [actionName, action] of actionMap) {
    for (const method of ['post', 'get']) {
      ob11HTTPServer.registerRouter(method, actionName, (res, payload) => action.handle(payload))
    }
  }
}, 0)

class HTTPHeart {
  intervalId: NodeJS.Timeout | null = null
  start() {
    const { heartInterval } = getConfigUtil().getConfig()
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.intervalId = setInterval(() => {
      // ws的心跳是ws自己维护的
      postOB11Event(new OB11HeartbeatEvent(selfInfo.online, true, heartInterval), false, false)
    }, heartInterval)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }
}

export const httpHeart = new HTTPHeart()
