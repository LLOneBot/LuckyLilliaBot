import {
    Config,
    Group,
    GroupMemberInfo,
    MessageElement,
    Peer,
    PostDataSendMsg, PttElement, RawMessage,
    SelfInfo,
    User
} from "./common/types";
import { SendIPCMsgSession } from "./main/ipcsend";


import {OB11Return, OB11MessageData, OB11SendMsgReturn} from "./onebot11/types";


declare var LLAPI: {
    on(event: "new-messages" | "new-send-messages", callback: (data: MessageElement[]) => void): void;
    on(event: "context-msg-menu", callback: (event: any, target: any, msgIds:any) => void): void;
    getAccountInfo(): Promise<{
        uid: string  // 一串加密的字符串
        uin: string  // qq
    }>

    getUserInfo(uid: string): Promise<User>; // uid是一串加密的字符串
    sendMessage(peer: Peer, message: OB11MessageData[]): Promise<any>;
    recallMessage(peer: Peer, msgIds: string[]): Promise<void>;
    getGroupsList(forced: boolean): Promise<Group[]>
    getFriendsList(forced: boolean): Promise<User[]>
    getGroupMemberList(group_id: string, num: number): Promise<{result: { infos: Map<string, GroupMemberInfo> }}>
    getPeer(): Promise<Peer>
    add_qmenu(func: (qContextMenu: Node)=>void): void
    Ptt2Text(msgId:string, peer: Peer, elements: MessageElement[]): Promise<any>

};


declare var llonebot: {
    postData: (data: any) => void
    listenSendMessage: (handle: (msg: SendIPCMsgSession<PostDataSendMsg>) => void) => void
    listenRecallMessage: (handle: (msg: {message_id: string}) => void) => void
    updateGroups: (groups: Group[]) => void
    updateFriends: (friends: User[]) => void
    updateGroupMembers: (data: { groupMembers: User[], group_id: string }) => void
    startExpress: () => void
    log(data: any): void,
    setConfig(config: Config):void;
    getConfig():Promise<Config>;
    setSelfInfo(selfInfo: SelfInfo):void;
    downloadFile(arg: {uri: string, fileName: string}):Promise<{errMsg: string, path: string}>;
    deleteFile(path: string[]):Promise<void>;
    getRunningStatus(): Promise<boolean>;
    sendSendMsgResult(sessionId: string, msgResult: OB11SendMsgReturn): void;
    file2base64(path: string): Promise<{err: string, data: string}>;
    getHistoryMsg(msgId: string): Promise<RawMessage>;
};

declare global {
    interface Window {
        LLAPI: typeof LLAPI;
        llonebot: typeof llonebot;
        LiteLoader: any;
    }
}