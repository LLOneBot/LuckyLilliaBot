export interface MsgService {
    sendSsoCmdReqByContend: (cmd: string, trace_id: string) => Promise<unknown>;
}
export type WrapperSession = {
    getMsgService(): MsgService;
};
