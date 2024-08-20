import { OB11Message } from '../types'
import { getSelfUin } from '@/common/data'
import { OB11BaseMetaEvent } from '../event/meta/OB11BaseMetaEvent'
import { OB11BaseNoticeEvent } from '../event/notice/OB11BaseNoticeEvent'
import { WebSocket as WebSocketClass } from 'ws'
import { wsReply } from './ws/reply'
import { log } from '@/common/utils'
import { getConfigUtil } from '@/common/config'
import crypto from 'crypto'
import { handleQuickOperation, QuickOperationEvent } from '../action/quick-operation'
import { postHttpEvent } from './event-for-http'

export type PostEventType = OB11Message | OB11BaseMetaEvent | OB11BaseNoticeEvent

const eventWSList: WebSocketClass[] = []

export function registerWsEventSender(ws: WebSocketClass) {
  eventWSList.push(ws)
}

export function unregisterWsEventSender(ws: WebSocketClass) {
  let index = eventWSList.indexOf(ws)
  if (index !== -1) {
    eventWSList.splice(index, 1)
  }
}

export function postWsEvent(event: PostEventType) {
  for (const ws of eventWSList) {
    new Promise((resolve) => {
      wsReply(ws, event)
      resolve(undefined)
    }).then()
  }
}

export function postOb11Event(msg: PostEventType, reportSelf = false, postWs = true) {
  const config = getConfigUtil().getConfig()
  const selfUin = getSelfUin()
  // 判断msg是否是event
  if (!config.reportSelfMessage && !reportSelf) {
    if (msg.post_type === 'message' && (msg as OB11Message).user_id.toString() == selfUin) {
      return
    }
  }
  if (config.ob11.enableHttpPost) {
    const msgStr = JSON.stringify(msg)
    const hmac = crypto.createHmac('sha1', config.ob11.httpSecret!)
    hmac.update(msgStr)
    const sig = hmac.digest('hex')
    let headers = {
      'Content-Type': 'application/json',
      'x-self-id': selfUin,
    }
    if (config.ob11.httpSecret) {
      headers['x-signature'] = 'sha1=' + sig
    }
    for (const host of config.ob11.httpHosts) {
      fetch(host, {
        method: 'POST',
        headers,
        body: msgStr,
      }).then(
        async (res) => {
          if (msg.post_type) {
            log(`HTTP 事件上报: ${host} `, msg.post_type)
          }
          try {
            const resJson = await res.json()
            log(`新消息事件HTTP上报返回快速操作: `, JSON.stringify(resJson))
            handleQuickOperation(msg as QuickOperationEvent, resJson).then().catch(log);
          } catch (e) {
            //log(`新消息事件HTTP上报没有返回快速操作，不需要处理`)
            return
          }
        },
        (err: any) => {
          log(`新消息事件HTTP上报失败: ${host} `, err, msg)
        },
      ).catch(log)
    }
  }
  if (postWs) {
    postWsEvent(msg)
  }
  if (!(msg.post_type == 'meta_event' && (msg as OB11BaseMetaEvent).meta_event_type == 'heartbeat')) {
    // 不上报心跳
    postHttpEvent(msg)
  }
}
