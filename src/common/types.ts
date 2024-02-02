export enum AtType {
    notAt = 0,
    atAll = 1,
    atUser = 2
}

export enum ChatType {
    friend = 1,
    group = 2,
    temp = 100
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

export const OnebotGroupMemberRole = {
    4: 'owner',
    3: 'admin',
    2: 'member'
}


export type SelfInfo = {
    user_id: string;
    nickname: string;
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
    chatType: ChatType
    name: string
    uid: string  // qq号
}

export type MessageElement = {
    raw: {
        msgId: string,
        msgTime: string,
        msgSeq: string,
        senderUin: string; // 发送者QQ号
        chatType: ChatType,
        elements: {
            replyElement: {
                senderUid: string,  // 原消息发送者QQ号
                sourceMsgIsIncPic: boolean;  // 原消息是否有图片
                sourceMsgText: string;
                replayMsgSeq: string;  // 源消息的msgSeq，可以通过这个找到源消息的msgId
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
            },
            pttElement: {
                canConvert2Text: boolean
                duration: number  // 秒数
                fileBizId: null
                fileId: number // 0
                fileName: string // "e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
                filePath: string // "/Users/C5366155/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_a6b15c9820595d25a56c1633ce19ad40/nt_data/Ptt/2023-11/Ori/e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
                fileSize: string // "4261"
                fileSubId: string // "0"
                fileUuid: string // "90j3z7rmRphDPrdVgP9udFBaYar#oK0TWZIV"
                formatType: string // 1
                invalidState: number // 0
                md5HexStr: string // "e4d09c784d5a2abcb2f9980bdc7acfe6"
                playState: number // 0
                progress: number // 0
                text: string // ""
                transferStatus: number // 0
                translateStatus: number // 0
                voiceChangeType: number // 0
                voiceType: number // 0
                waveAmplitudes: number[]
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
    data?: {
        text: string, // 纯文本
    }
} | {
    type: "image" | "voice" | "record",
    file: string, // 本地路径
    data?: {
        file: string // 本地路径
    }
} | {
    type: "at",
    atType?: AtType,
    content?: string,
    atUid?: string,
    atNtUid?: string,
    data?: {
        qq: string // at的qq号
    }
} | {
    type: "reply",
    msgId: string,
    msgSeq: string,
    senderUin: string,
    data: {
        id: string,
    }
}

export type PostDataAction = "send_private_msg" | "send_group_msg" | "get_group_list"
    | "get_friend_list" | "delete_msg" | "get_login_info" | "get_group_member_list" | "get_group_member_info"

export type PostDataSendMsg = {
    action: PostDataAction
    message_type?: "private" | "group"
    params?: {
        user_id: string,
        group_id: string,
        message: SendMessage[];
    },
    user_id: string,
    group_id: string,
    message: SendMessage[];
    ipc_uuid?: string
}

export type Config = {
    port: number,
    hosts: string[],
}

export type SendMsgResult = {
    status: number,
    retcode: number,
    data: any,
    message: string,
}