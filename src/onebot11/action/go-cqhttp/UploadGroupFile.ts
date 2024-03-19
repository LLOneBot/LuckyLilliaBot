import BaseAction from "../BaseAction";
import {getGroup} from "../../../common/data";
import {ActionName} from "../types";
import {SendMsgElementConstructor} from "../../../ntqqapi/constructor";
import {ChatType, SendFileElement} from "../../../ntqqapi/types";
import fs from "fs";
import {NTQQMsgApi} from "../../../ntqqapi/api/msg";
import {uri2local} from "../../../common/utils";

interface Payload{
    group_id: number
    file: string
    name: string
    folder: string
}

export default class GoCQHTTPUploadGroupFile extends BaseAction<Payload, null> {
    actionName = ActionName.GoCQHTTP_UploadGroupFile

    protected async _handle(payload: Payload): Promise<null> {
        const group = await getGroup(payload.group_id.toString());
        if (!group){
            throw new Error(`群组${payload.group_id}不存在`)
        }
        let file = payload.file;
        if (fs.existsSync(file)){
            file = `file://${file}`
        }
        const downloadResult = await uri2local(file);
        if (downloadResult.errMsg){
            throw new Error(downloadResult.errMsg)
        }
        let sendFileEle: SendFileElement = await SendMsgElementConstructor.file(downloadResult.path, payload.name);
        await NTQQMsgApi.sendMsg({chatType: ChatType.group, peerUid: group.groupCode}, [sendFileEle]);
        return null
    }
}