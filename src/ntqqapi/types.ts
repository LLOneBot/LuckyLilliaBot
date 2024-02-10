
export interface User {
    uid: string; // 加密的字符串
    uin: string; // QQ号
    nick: string;
    avatarUrl?: string;
    longNick: string; // 签名
    raw: {
        remark: string;
    };
}

export interface Group{
    groupCode: string,
    maxMember: number,
    memberCount: number,
    groupName: string,
    groupStatus: 0,
    memberRole: 2,
    isTop: boolean,
    toppedTimestamp: "0",
    privilegeFlag: number, //65760
    isConf: boolean,
    hasModifyConfGroupFace: boolean,
    hasModifyConfGroupName: boolean,
    remarkName: string,
    hasMemo: boolean,
    groupShutupExpireTime: string, //"0",
    personShutupExpireTime: string, //"0",
    discussToGroupUin: string, //"0",
    discussToGroupMaxMsgSeq: number,
    discussToGroupTime: number,
    groupFlagExt: number, //1073938496,
    authGroupType: number, //0,
    groupCreditLevel: number, //0,
    groupFlagExt3: number, //0,
    groupOwnerId: {
        "memberUin": string, //"0",
        "memberUid": string, //"u_fbf8N7aeuZEnUiJAbQ9R8Q"
    },
    members: GroupMember[]  // 原始数据是没有这个的，为了方便自己加了这个字段
}

export interface GroupMember {
    avatarPath: string;
    cardName: string;
    cardType: number;
    isDelete: boolean;
    nick: string;
    qid: string;
    remark: string;
    role: number; // 群主:4, 管理员:3，群员:2
    shutUpTime: number; // 禁言时间，单位是什么暂时不清楚
    uid: string; // 加密的字符串
    uin: string; // QQ号
}

export enum ElementType {
    TEXT = 1,
    PIC = 2,
    PTT = 4,
    REPLY = 7,
}

export interface SendTextElement {
    elementType: ElementType.TEXT,
    elementId: "",
    textElement: {
        content: string,
        atType: number,
        atUid: string,
        atTinyId: string,
        atNtUid: string,
    }
}
export interface SendPttElement {
    elementType: ElementType.PTT,
    elementId: "",
    pttElement: {
        fileName: string,
        filePath: string,
        md5HexStr: string,
        fileSize: number,
        duration: number,
        formatType: number,
        voiceType: number,
        voiceChangeType: number,
        canConvert2Text: boolean,
        waveAmplitudes: number[],
        fileSubId: "",
        playState: number,
        autoConvertText: number,
    }
}

export interface SendPicElement {
    elementType: ElementType.PIC,
    elementId: "",
    picElement: {
        md5HexStr: string,
        fileSize: number,
        picWidth: number,
        picHeight: number,
        fileName: string,
        sourcePath: string,
        original: boolean,
        picType: number,
        picSubType: number,
        fileUuid: string,
        fileSubId: string,
        thumbFileSize: number,
        summary: string,
    }
}

export interface SendReplyElement {
    elementType: ElementType.REPLY,
    elementId: "",
    replyElement: {
        replayMsgSeq: string,
        replayMsgId: string,
        senderUin: string,
        senderUinStr: string,
    }
}

export type SendMessageElement = SendTextElement | SendPttElement | SendPicElement | SendReplyElement

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
export interface PttElement {
    canConvert2Text: boolean;
    duration: number; // 秒数
    fileBizId: null;
    fileId: number; // 0
    fileName: string; // "e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
    filePath: string; // "/Users//Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_a6b15c9820595d25a56c1633ce19ad40/nt_data/Ptt/2023-11/Ori/e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
    fileSize: string; // "4261"
    fileSubId: string; // "0"
    fileUuid: string; // "90j3z7rmRphDPrdVgP9udFBaYar#oK0TWZIV"
    formatType: string; // 1
    invalidState: number; // 0
    md5HexStr: string; // "e4d09c784d5a2abcb2f9980bdc7acfe6"
    playState: number; // 0
    progress: number; // 0
    text: string; // ""
    transferStatus: number; // 0
    translateStatus: number; // 0
    voiceChangeType: number; // 0
    voiceType: number; // 0
    waveAmplitudes: number[];
}

export interface ArkElement {
    bytesData: string;
}

export interface RawMessage {
    msgId: string;
    msgTime: string;
    msgSeq: string;
    senderUin: string; // 发送者QQ号
    peerUid: string; // 群号 或者 QQ uid
    peerUin: string; // 群号 或者 发送者QQ号
    sendNickName: string;
    sendMemberName?: string; // 发送者群名片
    chatType: ChatType;
    elements: {
        replyElement: {
            senderUid: string; // 原消息发送者QQ号
            sourceMsgIsIncPic: boolean; // 原消息是否有图片
            sourceMsgText: string;
            replayMsgSeq: string; // 源消息的msgSeq，可以通过这个找到源消息的msgId
        };
        textElement: {
            atType: AtType;
            atUid: string;
            content: string;
            atNtUid: string;
        };
        picElement: {
            sourcePath: string; // 图片本地路径
            picWidth: number;
            picHeight: number;
            fileSize: number;
            fileName: string;
            fileUuid: string;
        };
        pttElement: PttElement;
        arkElement: ArkElement;
    }[];
}

export interface MessageElement {
    raw: RawMessage;
    peer: any;
    sender: {
        uid: string; // 一串加密的字符串
        memberName: string;
        nickname: string;
    };
}


