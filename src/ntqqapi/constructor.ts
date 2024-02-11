import {ElementType, SendPicElement, SendPttElement, SendReplyElement, SendTextElement, AtType} from "./types";
import {NTQQApi} from "./ntcall";


export class SendMsgElementConstructor {
    static text(content: string): SendTextElement {
        return {
            elementType: ElementType.TEXT,
            elementId: "",
            textElement: {
                content,
                atType: AtType.notAt,
                atUid: "",
                atTinyId: "",
                atNtUid: "",
            },
        };
    }

    static at(atUid: string, atNtUid: string, atType: AtType, atName: string): SendTextElement {
        return {
            elementType: ElementType.TEXT,
            elementId: "",
            textElement: {
                content: `@${atName}`,
                atType,
                atUid,
                atTinyId: "",
                atNtUid,
            },
        };
    }

    static reply(msgSeq: string, msgId: string, senderUin: string, senderUinStr: string): SendReplyElement {
        return {
            elementType: ElementType.REPLY,
            elementId: "",
            replyElement: {
                replayMsgSeq: msgSeq, // raw.msgSeq
                replayMsgId: msgId,  // raw.msgId
                senderUin: senderUin,
                senderUinStr: senderUinStr,
            }
        }
    }

    static async pic(picPath: string): Promise<SendPicElement>{
        const {md5, fileName, path, fileSize} = await NTQQApi.uploadFile(picPath);
        const imageSize = await NTQQApi.getImageSize(picPath);
        const picElement = {
            md5HexStr: md5,
            fileSize: fileSize,
            picWidth: imageSize.width,
            picHeight: imageSize.height,
            fileName: fileName,
            sourcePath: path,
            original: true,
            picType: 1001,
            picSubType: 0,
            fileUuid: "",
            fileSubId: "",
            thumbFileSize: 0,
            summary: "",
        };

        return {
            elementType: ElementType.PIC,
            elementId: "",
            picElement
        };
    }

    static async ptt(pttPath: string):Promise<SendPttElement> {
        const {md5, fileName, path, fileSize} = await NTQQApi.uploadFile(pttPath);
        return {
            elementType: ElementType.PTT,
            elementId: "",
            pttElement: {
                fileName: fileName,
                filePath: path,
                md5HexStr: md5,
                fileSize: fileSize,
                duration: Math.max(1, Math.round(fileSize / 1024 / 3)), // 一秒钟大概是3kb大小, 小于1秒的按1秒算
                formatType: 1,
                voiceType: 1,
                voiceChangeType: 0,
                canConvert2Text: true,
                waveAmplitudes: [
                    0, 18, 9, 23, 16, 17, 16, 15, 44, 17, 24, 20, 14, 15, 17,
                ],
                fileSubId: "",
                playState: 1,
                autoConvertText: 0,
            }
        };
    }
}