import SendMsg from '../msg/SendMsg'
import { OB11PostSendMsg } from '../../types'
import { ActionName } from '../types'

export class SendForwardMsg extends SendMsg {
  actionName = ActionName.GoCQHTTP_SendForwardMsg

  protected async _handle(payload: OB11PostSendMsg) {
    if (payload.messages) payload.message = payload.messages
    return super._handle(payload)
  }
}

export class SendPrivateForwardMsg extends SendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendPrivateForwardMsg
}

export class SendGroupForwardMsg extends SendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendGroupForwardMsg
}
