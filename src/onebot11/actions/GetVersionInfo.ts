import BaseAction from "./BaseAction";
import {OB11Version} from "../types";
import {version} from "../../common/data";
import {ActionName} from "./types";

export default class GetVersionInfo extends BaseAction<any, OB11Version>{
    actionName = ActionName.GetVersionInfo
    protected async _handle(payload: any): Promise<OB11Version> {
        return {
            app_name: "LLOneBot",
            protocol_version: "v11",
            app_version: version
        }
    }
}