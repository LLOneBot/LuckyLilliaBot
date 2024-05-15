import { GroupEssenceMsgRet, WebApi } from "@/ntqqapi/api";
import BaseAction from "../BaseAction";
import { ActionName } from "../types";

interface PayloadType {
  group_id: number;
  pages: number;
}

export class GetGroupEssence extends BaseAction<PayloadType, GroupEssenceMsgRet> {
  actionName = ActionName.GoCQHTTP_GetEssenceMsg;

  protected async _handle(payload: PayloadType) {
    const ret = await WebApi.getGroupEssenceMsg(payload.group_id.toString(), payload.pages.toString());
    if (!ret) {
      throw new Error('获取失败');
    }
    return ret;
  }
}
