import SendMsg from '../msg/SendMsg'
import { OB11PostSendMsg } from '../../types'
import { ActionName } from '../types'
import { convertMessage2List } from '../../helper/createMessage'

export class GoCQHTTPSendForwardMsg extends SendMsg {
  actionName = ActionName.GoCQHTTP_SendForwardMsg

  protected async check(payload: OB11PostSendMsg) {
    if (payload.messages) payload.message = convertMessage2List(payload.messages)
    return super.check(payload)
  }
}

export class GoCQHTTPSendPrivateForwardMsg extends GoCQHTTPSendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendPrivateForwardMsg
}

export class GoCQHTTPSendGroupForwardMsg extends GoCQHTTPSendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendGroupForwardMsg
}
