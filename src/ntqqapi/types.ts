export interface User {
    uid: string; // 加密的字符串
    uin: string; // QQ号
    nick: string;
    avatarUrl?: string;
    longNick?: string; // 签名
    remark?: string
}

export interface SelfInfo extends User {
    online?: boolean;
}

export interface Friend extends User {
}

export interface Group {
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

export enum GroupMemberRole {
    normal = 2,
    admin = 3,
    owner = 4
}

export interface GroupMember {
    avatarPath: string;
    cardName: string;
    cardType: number;
    isDelete: boolean;
    nick: string;
    qid: string;
    remark: string;
    role: GroupMemberRole; // 群主:4, 管理员:3，群员:2
    shutUpTime: number; // 禁言时间，单位是什么暂时不清楚
    uid: string; // 加密的字符串
    uin: string; // QQ号
    isRobot: boolean;
}

export enum ElementType {
    TEXT = 1,
    PIC = 2,
    FILE = 3,
    PTT = 4,
    FACE = 6,
    REPLY = 7,
    ARK = 10,
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
        duration: number,  // 单位是秒
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

export enum PicType {
    gif = 2000,
    jpg = 1000
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
        picType: PicType,
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

export interface SendFaceElement {
    elementType: ElementType.FACE,
    elementId: "",
    faceElement: FaceElement
}

export interface FileElement {
    "fileMd5"?: "",
    "fileName": string,
    "filePath": string,
    "fileSize": string,
    "picHeight"?: number,
    "picWidth"?: number,
    "picThumbPath"?: {},
    "file10MMd5"?: "",
    "fileSha"?: "",
    "fileSha3"?: "",
    "fileUuid"?: "",
    "fileSubId"?: "",
    "thumbFileSize"?: number
}

export interface SendFileElement {
    elementType: ElementType.FILE,
    elementId: "",
    fileElement: FileElement
}

export interface SendArkElement {
    elementType: ElementType.ARK,
    elementId: "",
    arkElement: ArkElement

}

export type SendMessageElement = SendTextElement | SendPttElement |
    SendPicElement | SendReplyElement | SendFaceElement | SendFileElement | SendArkElement

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
    linkInfo:null,
    subElementType:null
}

export const IMAGE_HTTP_HOST = "https://gchat.qpic.cn"

export interface PicElement {
    originImageUrl: string;  // http url, 没有host，host是https://gchat.qpic.cn/
    sourcePath: string; // 图片本地路径
    thumbPath: Map<number, string>;
    picWidth: number;
    picHeight: number;
    fileSize: number;
    fileName: string;
    fileUuid: string;
    md5HexStr?: string;
}

export interface GrayTipElement {
    revokeElement: {
        operatorRole: string;
        operatorUid: string;
        operatorNick: string;
        operatorRemark: string;
        operatorMemRemark?: string;
        wording: string;  // 自定义的撤回提示语
    }
    aioOpGrayTipElement: TipAioOpGrayTipElement
}

export interface FaceElement {
    faceIndex: number,
    faceType: 1
}

export interface VideoElement {
    "filePath": string,
    "fileName": string,
    "videoMd5": string,
    "thumbMd5": string
    "fileTime": 87, // second
    "thumbSize": 314235, // byte
    "fileFormat": 2,  // 2表示mp4？
    "fileSize": string,  // byte
    "thumbWidth": number,
    "thumbHeight": number,
    "busiType": 0, // 未知
    "subBusiType": 0, // 未知
    "thumbPath": Map<number, any>,
    "transferStatus": 0, // 未知
    "progress": 0,  // 下载进度？
    "invalidState": 0, // 未知
    "fileUuid": string,  // 可以用于下载链接？
    "fileSubId": "",
    "fileBizId": null,
    "originVideoMd5": "",
    "import_rich_media_context": null,
    "sourceVideoCodecFormat": 0
}

export interface TipAioOpGrayTipElement{
    operateType: number,
    peerUid: string,
    fromGrpCodeOfTmpChat: string,
}

export interface TipGroupElement {
    "type": 1,  // 1是表示有人加入群, 自己加入群也会收到这个
    "role": 0,
    "groupName": string,  // 暂时获取不到
    "memberUid": string,
    "memberNick": string,
    "memberRemark": string,
    "adminUid": string,  // 同意加群的管理员uid
    "adminNick": string,
    "adminRemark": string,
    "createGroup": null,
    "memberAdd": {
        "showType": 1,
        "otherAdd": null,
        "otherAddByOtherQRCode": null,
        "otherAddByYourQRCode": null,
        "youAddByOtherQRCode": null,
        "otherInviteOther": null,
        "otherInviteYou": null,
        "youInviteOther": null
    },
    "shutUp": null
}


export interface RawMessage {
    msgId: string;
    msgShortId?: number;  // 自己维护的消息id
    msgTime: string; // 时间戳，秒
    msgSeq: string;
    senderUid: string;
    senderUin?: string; // 发送者QQ号
    peerUid: string; // 群号 或者 QQ uid
    peerUin: string; // 群号 或者 发送者QQ号
    sendNickName: string;
    sendMemberName?: string; // 发送者群名片
    chatType: ChatType;
    sendStatus?: number;  // 消息状态，别人发的2是已撤回，自己发的2是已发送
    recallTime: string; // 撤回时间, "0"是没有撤回
    elements: {
        elementId: string,
        elementType: ElementType;
        replyElement: {
            senderUid: string; // 原消息发送者QQ号
            sourceMsgIsIncPic: boolean; // 原消息是否有图片
            sourceMsgText: string;
            replayMsgSeq: string; // 源消息的msgSeq，可以通过这个找到源消息的msgId
        };
        textElement: {
            atType: AtType;
            atUid: string; // QQ号
            content: string;
            atNtUid: string; // uid号
        };
        picElement: PicElement;
        pttElement: PttElement;
        arkElement: ArkElement;
        grayTipElement: GrayTipElement;
        faceElement: FaceElement;
        videoElement: VideoElement;
        fileElement: FileElement;
    }[];
}

export enum GroupNotifyTypes {
    INVITE_ME = 1,
    INVITED_JOIN = 4,  // 有人接受了邀请入群
    JOIN_REQUEST = 7,
    ADMIN_SET = 8,
    ADMIN_UNSET = 12,
    MEMBER_EXIT = 11, // 主动退出?

}

export interface GroupNotifies {
    doubt: boolean,
    nextStartSeq: string,
    notifies: GroupNotify[],
}

export interface GroupNotify {
    time: number;  // 自己添加的字段，时间戳，毫秒, 用于判断收到短时间内收到重复的notify
    seq: string, // 转成数字，再除以1000应该就是时间戳？
    type: GroupNotifyTypes,
    status: 0,  // 未知
    group: { groupCode: string, groupName: string },
    user1: { uid: string, nickName: string }, // 被设置管理员的人
    user2: { uid: string, nickName: string },  // 操作者
    actionUser: { uid: string, nickName: string }, //未知
    actionTime: string,
    invitationExt: {
        srcType: number,  // 0?未知
        groupCode: string, waitStatus: number
    },
    postscript: string,  // 加群用户填写的验证信息
    repeatSeqs: [],
    warningTips: string
}

export enum GroupRequestOperateTypes {
    approve = 1,
    reject = 2
}

export interface FriendRequest {
    friendUid: string,
    reqTime: string,  // 时间戳,秒
    extWords: string,  // 申请人填写的验证消息
    isUnread: boolean,
    friendNick: string,
    sourceId: number,
    groupCode: string
}

export interface FriendRequestNotify {
    data: {
        unreadNums: number,
        buddyReqs: FriendRequest[]
    }
}

export interface CacheScanResult {
    result: number,
    size: [ // 单位为字节
        string, // 系统总存储空间
        string, // 系统可用存储空间
        string, // 系统已用存储空间
        string, // QQ总大小
        string, // 「聊天与文件」大小
        string, // 未知
        string, // 「缓存数据」大小
        string, // 「其他数据」大小
        string, // 未知
    ]
}

export interface ChatCacheList {
    pageCount: number,
    infos: ChatCacheListItem[]
}

export interface ChatCacheListItem {
    chatType: ChatType,
    basicChatCacheInfo: ChatCacheListItemBasic,
    guildChatCacheInfo: unknown[] // TODO: 没用过频道所以不知道这里边的详细内容
}

export interface ChatCacheListItemBasic {
    chatSize: string,
    chatTime: string,
    uid: string,
    uin: string,
    remarkName: string,
    nickName: string,
    chatType?: ChatType,
    isChecked?: boolean
}

export enum CacheFileType {
    IMAGE = 0,
    VIDEO = 1,
    AUDIO = 2,
    DOCUMENT = 3,
    OTHER = 4,
}

export interface CacheFileList {
    infos: CacheFileListItem[],
}

export interface CacheFileListItem {
    fileSize: string,
    fileTime: string,
    fileKey: string,
    elementId: string,
    elementIdStr: string,
    fileType: CacheFileType,
    path: string,
    fileName: string,
    senderId: string,
    previewPath: string,
    senderName: string,
    isChecked?: boolean,
}
