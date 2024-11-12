import { WrapperSession } from './wrapper-session/types';
export { initWrapperSession } from './wrapper-session';
export declare class NTQQPacketApi {
    private qqVersion;
    private packetSession;
    private logger;
    private readonly wrapperSession;
    constructor(wrapperSession: WrapperSession);
    get available(): boolean;
    private InitSendPacket;
    private sendPacket;
    private sendOidbPacket;
    sendPokePacket(peer: number, group?: number): Promise<void>;
    sendGroupSignPacket(selfUin: string, groupCode: string): Promise<void>;
    sendSetSpecialTittlePacket(groupCode: string, uid: string, tittle: string): Promise<void>;
}
