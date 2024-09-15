import SendMsg from '../msg/SendMsg'
import { ActionName } from '../types'
import { OB11PostSendMsg } from '../../types'

class SendGroupMsg extends SendMsg {
  actionName = ActionName.SendGroupMsg

  protected _handle(payload: OB11PostSendMsg) {
    delete (payload as Partial<OB11PostSendMsg>).user_id
    payload.message_type = 'group'
    return super._handle(payload)
  }
}

export default SendGroupMsg
