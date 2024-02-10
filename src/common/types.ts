import {OB11ApiName, OB11MessageData} from "../onebot11/types";

export interface SelfInfo {
    user_id: string;
    nickname: string;
}

export interface Config {
    port: number
    hosts: string[]
    enableBase64?: boolean
    debug?: boolean
    reportSelfMessage?: boolean
    log?: boolean
}

