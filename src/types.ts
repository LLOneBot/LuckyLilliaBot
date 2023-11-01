export enum AtType {
    notAt = 0,
    atUser = 2
}
export type GroupMemberInfo = {
    avatarPath: string;
    cardName: string;
    cardType: number;
    isDelete: boolean;
    nick: string;
    qid: string;
    remark: string;
    role: number;  // 群主:4, 管理员:3，群员:2
    shutUpTime: number;  // 禁言时间，单位是什么暂时不清楚
    uid: string; // 加密的字符串
    uin: string; // QQ号
}

export type User = {
    avatarUrl?: string;
    bio?: string;  // 签名
    nickName: string;
    uid?: string;  // 加密的字符串
    uin: string; // QQ号
}

export type Group = {
    uid: string; // 群号
    name: string;
    members?: GroupMemberInfo[];
}

export type Peer = {
    chatType: "private" | "group"
    name: string
    uid: string  // qq号
}

export type MessageElement = {
    raw: {
        elements: {

            replyElement: {
                senderUid: string,  // 原消息发送者QQ号
                sourceMsgIsIncPic: boolean;  // 原消息是否有图片
                sourceMsgText: string;
                sourceMsgIdInRecords: string;  // 原消息id
            },
            textElement: {
                atType: AtType
                atUid: string,
                content: string,
                atNtUid: string
            },
            picElement: {
                sourcePath: string // 图片本地路径
                picWidth: number
                picHeight: number
                fileSize: number
                fileName: string
                fileUuid: string
            }
        }[]
    }

    peer: Peer,
    sender: {
        uid: string  // 一串加密的字符串
        memberName: string
        nickname: string
    }
}

export type SendMessage = {
    type: "text",
    content: string,
} | {
    type: "image",
    file: string, // 本地路径
}

export type PostDataSendMsg = {
    action: "send_private_msg" | "send_group_msg" | "get_group_list",
    params: {
        user_id: string,
        group_id: string,
        message: SendMessage[];
    }
}