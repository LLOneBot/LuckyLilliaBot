import { OB11Return } from '../types';

export class OB11Response {
    static res<T>(data: T, status: number = 0, message: string = "", echo=""): OB11Return<T> {
        return {
            status: status,
            retcode: status,
            data: data,
            message: message,
            echo,
        }
    }
    static ok<T>(data: T) {
        return OB11Response.res<T>(data)
    }
    static error(err: string, status=-1) {
        return OB11Response.res(null, status, err)
    }
}
