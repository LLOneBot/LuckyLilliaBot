
import BaseAction from '../BaseAction';
import { ActionName } from '../types';
import { NTQQGroupApi } from '../../../ntqqapi/api/group'
import { dbUtil } from '@/common/db';

interface Payload {
  message_id: number | string;
}

export default class GoCQHTTPDelEssenceMsg extends BaseAction<Payload, any> {
  actionName = ActionName.GoCQHTTP_DelEssenceMsg;

  protected async _handle(payload: Payload): Promise<any> {
    const msg = await dbUtil.getMsgByShortId(parseInt(payload.message_id.toString()));
    if (!msg) {
      throw new Error('msg not found');
    }
    return await NTQQGroupApi.removeGroupEssence(
      msg.peerUid,
      msg.msgId
    );
  }
}
