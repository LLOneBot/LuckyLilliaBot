import {GroupMemberRole} from "./group";
import exp from "constants";

export enum ElementType {
    TEXT = 1,
    PIC = 2,
    FILE = 3,
    PTT = 4,
    VIDEO = 5,
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

export enum PicSubType {
    normal = 0, // 普通图片，大图
    face = 1  // 表情包小图
}

export interface SendPicElement {
    elementType: ElementType.PIC,
    elementId: "",
    picElement: {
        md5HexStr: string,
        fileSize: number | string,
        picWidth: number,
        picHeight: number,
        fileName: string,
        sourcePath: string,
        original: boolean,
        picType: PicType,
        picSubType: PicSubType,
        fileUuid: string,
        fileSubId: string,
        thumbFileSize: number,
        summary: string,
    },
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
    "thumbFileSize"?: number,
    fileBizId?: number
}

export interface SendFileElement {
    elementType: ElementType.FILE
    elementId: "",
    fileElement: FileElement
}

export interface SendVideoElement {
    elementType: ElementType.VIDEO
    elementId: "",
    videoElement: VideoElement
}

export interface SendArkElement {
    elementType: ElementType.ARK,
    elementId: "",
    arkElement: ArkElement

}

export type SendMessageElement = SendTextElement | SendPttElement |
    SendPicElement | SendReplyElement | SendFaceElement | SendFileElement | SendVideoElement | SendArkElement

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
    linkInfo: null,
    subElementType: null
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

export enum GrayTipElementSubType {
    INVITE_NEW_MEMBER = 12,
    MEMBER_NEW_TITLE = 17
}

export interface GrayTipElement {
    subElementType: GrayTipElementSubType;
    revokeElement: {
        operatorRole: string;
        operatorUid: string;
        operatorNick: string;
        operatorRemark: string;
        operatorMemRemark?: string;
        wording: string;  // 自定义的撤回提示语
    }
    aioOpGrayTipElement: TipAioOpGrayTipElement,
    groupElement: TipGroupElement,
    xmlElement: {
        content: string;
    },
    jsonGrayTipElement: {
        jsonStr: string;
    }
}

export interface FaceElement {
    faceIndex: number,
    faceType: 1
}

export interface MarketFaceElement {
    "itemType": 6,
    "faceInfo": 1,
    "emojiPackageId": 203875,
    "subType": 3,
    "mediaType": 0,
    "imageWidth": 200,
    "imageHeight": 200,
    "faceName": string,
    "emojiId": "094d53bd1c9ac5d35d04b08e8a6c992c",
    "key": "a8b1dd0aebc8d910",
    "param": null,
    "mobileParam": null,
    "sourceType": null,
    "startTime": null,
    "endTime": null,
    "emojiType": 1,
    "hasIpProduct": null,
    "voiceItemHeightArr": null,
    "sourceName": null,
    "sourceJumpUrl": null,
    "sourceTypeName": null,
    "backColor": null,
    "volumeColor": null,
    "staticFacePath": "E:\\SystemDocuments\\QQ\\721011692\\nt_qq\\nt_data\\Emoji\\marketface\\203875\\094d53bd1c9ac5d35d04b08e8a6c992c_aio.png",
    "dynamicFacePath": "E:\\SystemDocuments\\QQ\\721011692\\nt_qq\\nt_data\\Emoji\\marketface\\203875\\094d53bd1c9ac5d35d04b08e8a6c992c",
    "supportSize": [
        {
            "width": 300,
            "height": 300
        },
        {
            "width": 200,
            "height": 200
        }
    ],
    "apngSupportSize": null
}

export interface VideoElement {
    "filePath": string,
    "fileName": string,
    "videoMd5"?: string,
    "thumbMd5"?: string
    "fileTime"?: number, // second
    "thumbSize"?: number, // byte
    "fileFormat"?: number,  // 2表示mp4？
    "fileSize"?: string,  // byte
    "thumbWidth"?: number,
    "thumbHeight"?: number,
    "busiType"?: 0, // 未知
    "subBusiType"?: 0, // 未知
    "thumbPath"?: Map<number, any>,
    "transferStatus"?: 0, // 未知
    "progress"?: 0,  // 下载进度？
    "invalidState"?: 0, // 未知
    "fileUuid"?: string,  // 可以用于下载链接？
    "fileSubId"?: "",
    "fileBizId"?: null,
    "originVideoMd5"?: "",
    "import_rich_media_context"?: null,
    "sourceVideoCodecFormat"?: number
}

export interface TipAioOpGrayTipElement {  // 这是什么提示来着？
    operateType: number,
    peerUid: string,
    fromGrpCodeOfTmpChat: string,
}

export enum TipGroupElementType {
    memberIncrease = 1,
    ban = 8
}

export interface TipGroupElement {
    "type": TipGroupElementType,  // 1是表示有人加入群, 自己加入群也会收到这个
    "role": 0,  // 暂时不知
    "groupName": string,  // 暂时获取不到
    "memberUid": string,
    "memberNick": string,
    "memberRemark": string,
    "adminUid": string,  // 同意加群的管理员uid
    "adminNick": string,
    "adminRemark": string,
    "createGroup": null,
    "memberAdd"?: {
        "showType": 1,
        "otherAdd": null,
        "otherAddByOtherQRCode": null,
        "otherAddByYourQRCode": null,
        "youAddByOtherQRCode": null,
        "otherInviteOther": null,
        "otherInviteYou": null,
        "youInviteOther": null
    },
    "shutUp"?: {
        "curTime": string,
        "duration": string,  // 禁言时间，秒
        "admin": {
            "uid": string,
            "card": string,
            "name": string,
            "role": GroupMemberRole
        },
        "member": {
            "uid": string
            "card": string,
            "name": string,
            "role": GroupMemberRole
        }
    }
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
        marketFaceElement: MarketFaceElement;
    }[];
}