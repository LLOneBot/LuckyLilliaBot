import {OB11ApiName, OB11MessageData} from "../onebot11/types";

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

export interface GroupMemberInfo {
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


export interface SelfInfo {
    user_id: string;
    nickname: string;
}

export interface User {
    avatarUrl?: string;
    bio?: string;  // 签名
    nickName: string;
    uid?: string;  // 加密的字符串
    uin: string; // QQ号
}

export interface Group {
    uid: string; // 群号
    name: string;
    members?: GroupMemberInfo[];
}

export interface Peer {
    chatType: ChatType
    name: string
    uid: string  // qq号
}

export interface PttElement {
    canConvert2Text: boolean
    duration: number  // 秒数
    fileBizId: null
    fileId: number // 0
    fileName: string // "e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
    filePath: string // "/Users//Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_a6b15c9820595d25a56c1633ce19ad40/nt_data/Ptt/2023-11/Ori/e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
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

export interface ArkElement {
    bytesData: string
}

export interface RawMessage {
    msgId: string,
    msgTime: string,
    msgSeq: string,
    senderUin: string; // 发送者QQ号
    peerUid: string; // 群号 或者 QQ uid
    peerUin: string; // 群号 或者 发送者QQ号
    sendNickName: string;
    sendMemberName?: string;  // 发送者群名片
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
        pttElement: PttElement,
        arkElement: ArkElement
    }[]
}

export interface MessageElement {
    raw: RawMessage
    peer: Peer,
    sender: {
        uid: string  // 一串加密的字符串
        memberName: string
        nickname: string
    }
}

export interface PostDataSendMsg {
    action: OB11ApiName
    message_type?: "private" | "group"
    params?: {
        user_id: string,
        group_id: string,
        message: OB11MessageData[];
    },
    user_id: string,
    group_id: string,
    message?: OB11MessageData[];
}

export interface Config {
    port: number
    hosts: string[]
    enableBase64?: boolean
    debug?: boolean
    reportSelfMessage?: boolean
    log?: boolean
}

