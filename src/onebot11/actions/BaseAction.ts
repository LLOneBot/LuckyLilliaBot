import { BaseCheckResult } from "./types"
import { OB11Response } from "./utils"

class BaseAction {
    async check(jsonData: any): Promise<BaseCheckResult> {
        return {
            valid: true,
        }
    }

    async handle(jsonData: any) {
        const result = await this.check(jsonData)
        if (!result.valid) {
            return OB11Response.error(result.message)
        }
        const resData = await this._handle(jsonData)
        return resData
    }

    async _handle(payload: unknown): Promise<unknown> {
        return
    }
}

export default BaseAction