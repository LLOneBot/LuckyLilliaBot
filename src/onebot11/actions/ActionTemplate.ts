// import { OB11Response } from "./utils";
// import { BaseCheckResult } from "./types";
// import { OB11Return } from '../types';

// export type ActionType = ''

// export interface PayloadType {
//     action: ActionType
//     // 参数定义待完善
//     [k: string | number]: any
// }

// export interface ReturnDataType {
//     // 参数定义待完善
//     [k: string | number]: any
// }


// class ActionTemplate {
//     static ACTION_TYPE: ActionType = ''

//     async check(jsonData: any): Promise<BaseCheckResult> {
//         return {
//             valid: true,
//         }
//     }

//     async handle(jsonData: any) {
//         const result = await this.check(jsonData)
//         if (!result.valid) {
//             return OB11Response.error(result.message)
//         }
//         const resData = await this._handle(jsonData)
//         return resData
//     }

//     async _handle(payload: PayloadType): Promise<OB11Return<ReturnDataType | null>> {
//     }
// }

// export default ActionTemplate