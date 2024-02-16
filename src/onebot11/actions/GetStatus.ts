import BaseAction from "./BaseAction";
import {OB11Status} from "../types";


export default class GetStatus extends BaseAction<any, OB11Status> {
    protected async _handle(payload: any): Promise<OB11Status> {
        return {
            online: null,
            good: true
        }
    }
}