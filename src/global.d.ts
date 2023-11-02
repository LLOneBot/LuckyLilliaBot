import {Group, GroupMemberInfo, MessageElement, Peer, PostDataSendMsg, SendMessage, User} from "./types";



declare var LLAPI: {
    on(event: "new-messages", callback: (data: MessageElement[]) => void): void;
    on(event: "context-msg-menu", callback: (event: any, target: any, msgIds:any) => void): void;
    getAccountInfo(): Promise<{
        uid: string  // qq
        uin: string  // 一串加密的字符串
    }>

    // uid是一串加密的字符串, 收到群消息的时候，可以用此函数获取群成员的qq号
    getUserInfo(uid: string): Promise<User>;
    sendMessage(peer: Peer, message: SendMessage[]): Promise<void>;
    getGroupsList(forced: boolean): Promise<Group[]>
    getFriendsList(forced: boolean): Promise<User[]>
    getGroupMemberList(group_id: string, num: number): Promise<{result: { infos: Map<string, GroupMemberInfo> }}>
    getPeer(): Promise<Peer>
    add_qmenu(func: (qContextMenu: Node)=>void): void
};





declare var llonebot: {
    postData: (data: any) => void
    listenSendMessage: (handle: (msg: PostDataSendMsg) => void) => void
    updateGroups: (groups: Group[]) => void
    updateFriends: (friends: User[]) => void
    updateGroupMembers: (data: { groupMembers: User[], group_id: string }) => void
    startExpress: () => void
    log(data: any): void
};

declare global {
    interface Window {
        LLAPI: typeof LLAPI;
        llonebot: typeof llonebot;
    }
}