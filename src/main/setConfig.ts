import { Config } from '../common/types'
import { httpHeart, ob11HTTPServer } from '../onebot11/server/http'
import { ob11WebsocketServer } from '../onebot11/server/ws/WebsocketServer'
import { ob11ReverseWebsockets } from '../onebot11/server/ws/ReverseWebsocket'
import { llonebotError } from '../common/data'
import { getConfigUtil } from '../common/config'
import { checkFfmpeg, log } from '../common/utils'

export async function setConfig(config: Config) {
  let oldConfig = { ...getConfigUtil().getConfig() }
  getConfigUtil().setConfig(config)
  if (config.ob11.httpPort != oldConfig.ob11.httpPort && config.ob11.enableHttp) {
    ob11HTTPServer.restart(config.ob11.httpPort)
  }
  // 判断是否启用或关闭HTTP服务
  if (!config.ob11.enableHttp) {
    ob11HTTPServer.stop()
  } else {
    ob11HTTPServer.start(config.ob11.httpPort)
  }
  // 正向ws端口变化，重启服务
  if (config.ob11.wsPort != oldConfig.ob11.wsPort) {
    ob11WebsocketServer.restart(config.ob11.wsPort)
    llonebotError.wsServerError = ''
  }
  // 判断是否启用或关闭正向ws
  if (config.ob11.enableWs != oldConfig.ob11.enableWs) {
    if (config.ob11.enableWs) {
      ob11WebsocketServer.start(config.ob11.wsPort)
    } else {
      ob11WebsocketServer.stop()
    }
  }
  // 判断是否启用或关闭反向ws
  if (config.ob11.enableWsReverse != oldConfig.ob11.enableWsReverse) {
    if (config.ob11.enableWsReverse) {
      ob11ReverseWebsockets.start()
    } else {
      ob11ReverseWebsockets.stop()
    }
  }
  if (config.ob11.enableWsReverse) {
    // 判断反向ws地址有变化
    if (config.ob11.wsHosts.length != oldConfig.ob11.wsHosts.length) {
      log('反向ws地址有变化, 重启反向ws服务')
      ob11ReverseWebsockets.restart()
    } else {
      for (const newHost of config.ob11.wsHosts) {
        if (!oldConfig.ob11.wsHosts.includes(newHost)) {
          log('反向ws地址有变化, 重启反向ws服务')
          ob11ReverseWebsockets.restart()
          break
        }
      }
    }
  }
  if (config.ob11.enableHttpHeart) {
    // 启动http心跳
    httpHeart.start()
  } else {
    // 关闭http心跳
    httpHeart.stop()
  }
  log('old config', oldConfig)
  log('配置已更新', config)
  checkFfmpeg(config.ffmpeg).then()
}
