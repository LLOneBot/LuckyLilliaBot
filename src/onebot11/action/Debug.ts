import BaseAction from "./BaseAction";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {friends} from "../../common/data";
import {ActionName} from "./types";
import {log} from "../../common/utils";

interface Payload{
    method: string,
    args: any[],
}

export default class Debug extends BaseAction<Payload, any>{
    actionName = ActionName.Debug
    protected async _handle(payload: Payload): Promise<any> {
        log("debug call ntqq api", payload);
        const method = NTQQApi[payload.method]
        if (!method){
            throw `${method} 不存在`
        }
        const result = method(...payload.args);
        if (method.constructor.name === "AsyncFunction"){
            return await result
        }
        return result
        // const info = await NTQQApi.getUserDetailInfo(friends[0].uid);
        // return info
    }
}