import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { NTQQGroupApi } from '@/ntqqapi/api'

interface Payload {
    group_id: string | number
    file_id: string
    busid?: 102
}

export class GoCQHTTPDelGroupFile extends BaseAction<Payload, void> {
    actionName = ActionName.GoCQHTTP_DelGroupFile

    async _handle(payload: Payload) {
        await NTQQGroupApi.delGroupFile(payload.group_id.toString(), [payload.file_id])
    }
}