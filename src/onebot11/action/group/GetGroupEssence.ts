import { GroupEssenceMsgRet, WebApi } from "@/ntqqapi/api";
import BaseAction from "../BaseAction";
import { ActionName } from "../types";

interface PayloadType {
  group_id: number;
  pages?: number;
}

export class GetGroupEssence extends BaseAction<PayloadType, GroupEssenceMsgRet> {
  actionName = ActionName.GoCQHTTP_GetEssenceMsg;

  protected async _handle(payload: PayloadType) {
    throw '此 api 暂不支持'
    const ret = await WebApi.getGroupEssenceMsg(payload.group_id.toString(), payload.pages?.toString() || '0');
    if (!ret) {
      throw new Error('获取失败');
    }
    // ret.map((item) => {
    //
    // })
    return ret;
  }
}
