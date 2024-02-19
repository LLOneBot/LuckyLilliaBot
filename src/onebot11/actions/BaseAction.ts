import {ActionName, BaseCheckResult} from "./types"
import {OB11Response, OB11WebsocketResponse} from "./utils"
import {OB11Return, OB11WebsocketReturn} from "../types";

class BaseAction<PayloadType, ReturnDataType> {
    actionName: ActionName
    protected async check(payload: PayloadType): Promise<BaseCheckResult> {
        return {
            valid: true,
        }
    }

    public async handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
        const result = await this.check(payload);
        if (!result.valid) {
            return OB11Response.error(result.message, 400);
        }
        try {
            const resData = await this._handle(payload);
            return OB11Response.ok(resData);
        } catch (e) {
            return OB11Response.error(e.toString(), 200);
        }
    }

    public async websocketHandle(payload: PayloadType, echo: string): Promise<OB11WebsocketReturn<ReturnDataType | null>> {
        const result = await this.check(payload)
        if (!result.valid) {
            return OB11WebsocketResponse.error(result.message, 1400)
        }
        try {
            const resData = await this._handle(payload)
            return OB11WebsocketResponse.ok(resData, echo);
        } catch (e) {
            return OB11WebsocketResponse.error(e.toString(), 1200)
        }
    }

    protected async _handle(payload: PayloadType): Promise<ReturnDataType> {
        throw `pleas override ${this.actionName} _handle`;
    }
}

export default BaseAction