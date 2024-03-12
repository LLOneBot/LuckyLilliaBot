import {
    AtType,
    ElementType,
    PicType,
    SendArkElement,
    SendFaceElement,
    SendFileElement,
    SendPicElement,
    SendPttElement,
    SendReplyElement,
    SendTextElement,
    SendVideoElement
} from "./types";
import {NTQQApi} from "./ntcall";
import {encodeSilk, isGIF, log} from "../common/utils";
import * as fs from "node:fs";


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

    static async pic(picPath: string): Promise<SendPicElement> {
        const {md5, fileName, path, fileSize} = await NTQQApi.uploadFile(picPath, ElementType.PIC);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        const imageSize = await NTQQApi.getImageSize(picPath);
        const picElement = {
            md5HexStr: md5,
            fileSize: fileSize,
            picWidth: imageSize.width,
            picHeight: imageSize.height,
            fileName: fileName,
            sourcePath: path,
            original: true,
            picType: isGIF(picPath) ? PicType.gif : PicType.jpg,
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

    static async file(filePath: string, fileName: string = ""): Promise<SendFileElement> {
        let picHeight = 0;
        let picWidth = 0;
        const {md5, fileName: _fileName, path, fileSize} = await NTQQApi.uploadFile(filePath, ElementType.FILE);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        let element: SendFileElement = {
            elementType: ElementType.FILE,
            elementId: "",
            fileElement: {
                fileName: fileName || _fileName,
                "filePath": path,
                "fileSize": (fileSize).toString(),
            }
        }

        return element;
    }

    static async video(filePath: string, fileName: string = ""): Promise<SendVideoElement> {
        const {md5, fileName: _fileName, path, fileSize} = await NTQQApi.uploadFile(filePath, ElementType.VIDEO);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        log("上传视频", md5, path, fileSize, fileName || _fileName)
        let thumbPath = new Map()
        thumbPath.set(0, "E:\\SystemDocuments\\QQ\\721011692\\nt_qq\\nt_data\\Video\\2024-03\\Thumb\\8950eb327e26c01e69d4a0fab7e2b159_0.png")
        let element: SendVideoElement = {
            elementType: ElementType.VIDEO,
            elementId: "",
            videoElement: {
                fileName: fileName || _fileName,
                filePath: path,
                videoMd5: md5,
                "thumbMd5": "9eee9e9a07b193cbaf4846522b0197b4",
                fileTime: 15,
                thumbPath: thumbPath,
                "thumbSize": 368286,
                "fileFormat": 2,
                "thumbWidth": 540,
                "thumbHeight": 960,
                // "busiType": 0,
                // "subBusiType": 0,
                // fileUuid: md5,
                fileSize: "" + fileSize,
                "transferStatus": 0,
                "progress": 0,
                "invalidState": 0,
                // "fileUuid": "3051020100043630340201000204169df3d602037a1afd020440f165b4020465f02cb304108950eb327e26c01e69d4a0fab7e2b15802037a1db902010004140000000866696c65747970650000000431303031",
                "fileSubId": "",
                "fileBizId": null,
                "originVideoMd5": "",
                "import_rich_media_context": null,
                "sourceVideoCodecFormat": 0
            }
        }
        return element;
        log("video element", element)
        let e = {
            "elementType": 5,
            "elementId": "",
            "videoElement": {
                "filePath": "E:\\SystemDocuments\\QQ\\721011692\\nt_qq\\nt_data\\Video\\2024-03\\Ori\\8950eb327e26c01e69d4a0fab7e2b158.mp4",
                "fileName": "8950eb327e26c01e69d4a0fab7e2b158.mp4",
                "videoMd5": "8950eb327e26c01e69d4a0fab7e2b158",
                "thumbMd5": "9eee9e9a07b193cbaf4846522b0197b4",
                "fileTime": 15,
                "thumbSize": 368286,
                "fileFormat": 2,
                "fileSize": "2084867",
                "thumbWidth": 540,
                "thumbHeight": 960,
                "busiType": 0,
                "subBusiType": 0,
                "thumbPath": thumbPath,
                "transferStatus": 0,
                "progress": 0,
                "invalidState": 0,
                "fileUuid": "3051020100043630340201000204169df3d602037a1afd020440f165b4020465f02cb304108950eb327e26c01e69d4a0fab7e2b15802037a1db902010004140000000866696c65747970650000000431303031",
                "fileSubId": "",
                "fileBizId": null,
                "originVideoMd5": "",
                "import_rich_media_context": null,
                "sourceVideoCodecFormat": 0
            }
        }
        return e as SendVideoElement
    }

    static async ptt(pttPath: string): Promise<SendPttElement> {
        const {converted, path: silkPath, duration} = await encodeSilk(pttPath);
        // log("生成语音", silkPath, duration);
        const {md5, fileName, path, fileSize} = await NTQQApi.uploadFile(silkPath, ElementType.PTT);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        if (converted) {
            fs.unlink(silkPath, () => {
            });
        }
        return {
            elementType: ElementType.PTT,
            elementId: "",
            pttElement: {
                fileName: fileName,
                filePath: path,
                md5HexStr: md5,
                fileSize: fileSize,
                // duration: Math.max(1, Math.round(fileSize / 1024 / 3)), // 一秒钟大概是3kb大小, 小于1秒的按1秒算
                duration: duration / 1000,
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

    static face(faceId: number): SendFaceElement {
        return {
            elementType: ElementType.FACE,
            elementId: "",
            faceElement: {
                faceIndex: faceId,
                faceType: 1
            }
        }
    }

    static ark(data: any): SendArkElement {
        return {
            elementType: ElementType.ARK,
            elementId: "",
            arkElement: data
        }
    }
}