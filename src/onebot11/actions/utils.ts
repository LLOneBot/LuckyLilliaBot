import { OB11Return } from '../types';

// export function createSuccessActionResponse<T>({
//     status = 0,
//     retcode = 0,
//     data = {} as T,
//     ...others
// }: Partial<OB11Return<any>> = {} = {}): OB11Return<any> {
//     return {
//         status,
//         retcode,
//         data,
//         message: '',
//         ...others
//     }
// }

// export function createFailedActionResponse({
//     status = -1,
//     retcode = -1,
//     message = '',
//     ...others
// }: Partial<OB11Return<any>> = {}): OB11Return<any> {
//     return {
//         status,
//         retcode,
//         data: {},
//         message,
//         ...others,
//     }
// }

// export function createActionParamsErrorResponse(type, others = {}) {
//     return createFailedActionResponse({
//         message: `${type} 接收到了不正确的参数`,
//         ...others,
//     })
// }

// export function createErrorResponseWithParams(params = {}) {
//     return createFailedActionResponse({
//         ...params,
//     })
// }

export class OB11Response {
    static res<T>(data: T, status: number = 0, message: string = ""): OB11Return<T> {
        return {
            status: status,
            retcode: status,
            data: data,
            message: message
        }
    }
    static ok<T>(data: T) {
        return OB11Response.res<T>(data)
    }
    static error(err: string) {
        return OB11Response.res(null, -1, err)
    }
}
