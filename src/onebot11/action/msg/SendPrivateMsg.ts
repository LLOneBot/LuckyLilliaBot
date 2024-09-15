import SendMsg from './SendMsg'
import { ActionName } from '../types'
import { OB11PostSendMsg } from '../../types'

class SendPrivateMsg extends SendMsg {
  actionName = ActionName.SendPrivateMsg

  protected _handle(payload: OB11PostSendMsg) {
    payload.message_type = 'private'
    return super._handle(payload)
  }
}

export default SendPrivateMsg
