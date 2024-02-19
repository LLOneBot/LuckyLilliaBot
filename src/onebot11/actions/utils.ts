import {OB11Return, OB11WebsocketReturn} from '../types';

export class OB11Response {
    static res<T>(data: T, status: string, retcode: number, message: string = ""): OB11Return<T> {
        return {
            status: status,
            retcode: retcode,
            data: data,
            message: message
        }
    }
    static ok<T>(data: T) {
        return OB11Response.res<T>(data, "ok", 0)
    }
    static error(err: string, retcode: number) {
        return OB11Response.res(null, "failed", retcode, err)
    }
}

export class OB11WebsocketResponse {
    static res<T>(data: T, status: string, retcode: number, echo: string, message: string = ""): OB11WebsocketReturn<T> {
        return {
            status: status,
            retcode: retcode,
            data: data,
            echo: echo,
            message: message
        }
    }
    static ok<T>(data: T, echo: string = "") {
        return OB11WebsocketResponse.res<T>(data, "ok", 0, echo)
    }
    static error(err: string, retcode: number, echo: string = "") {
        return OB11WebsocketResponse.res(null, "failed", retcode, echo, err)
    }
}
