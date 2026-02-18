import { RawMessage } from '../types'

export interface NodeIKernelMsgListener {
  onMsgInfoListUpdate(msgList: RawMessage[]): void
}
