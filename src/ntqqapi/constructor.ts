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
import {promises as fs} from "node:fs";
import ffmpeg from "fluent-ffmpeg"
import {NTQQFileApi} from "./api/file";
import {calculateFileMD5, encodeSilk, isGIF} from "../common/utils/file";
import {log} from "../common/utils/log";
import {defaultVideoThumb, getVideoInfo} from "../common/utils/video";


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

    static async pic(picPath: string, summary: string = ""): Promise<SendPicElement> {
        const {md5, fileName, path, fileSize} = await NTQQFileApi.uploadFile(picPath, ElementType.PIC);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        const imageSize = await NTQQFileApi.getImageSize(picPath);
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
            summary,
        };

        return {
            elementType: ElementType.PIC,
            elementId: "",
            picElement
        };
    }

    static async file(filePath: string, fileName: string = ""): Promise<SendFileElement> {
        const {md5, fileName: _fileName, path, fileSize} = await NTQQFileApi.uploadFile(filePath, ElementType.FILE);
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

    static async video(filePath: string, fileName: string = "", diyThumbPath: string = ""): Promise<SendVideoElement> {
        let {fileName: _fileName, path, fileSize, md5} = await NTQQFileApi.uploadFile(filePath, ElementType.VIDEO);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        const pathLib = require("path");
        let thumb = path.replace(`${pathLib.sep}Ori${pathLib.sep}`, `${pathLib.sep}Thumb${pathLib.sep}`)
        thumb = pathLib.dirname(thumb)
        // log("thumb 目录", thumb)
        let videoInfo ={
            width: 1920, height: 1080,
            time: 15,
            format: "mp4",
            size: fileSize,
            filePath
        };
        try {
            videoInfo = await getVideoInfo(path);
            log("视频信息", videoInfo)
        }catch (e) {
            log("获取视频信息失败", e)
        }
        const createThumb = new Promise<string>((resolve, reject) => {
            const thumbFileName = `${md5}_0.png`
            const thumbPath = pathLib.join(thumb, thumbFileName)
            ffmpeg(filePath)
                .on("end", () => {
                })
                .on("error", (err) => {
                    log("获取视频封面失败，使用默认封面", err)
                    if (diyThumbPath) {
                        fs.copyFile(diyThumbPath, thumbPath).then(() => {
                            resolve(thumbPath);
                        }).catch(reject)
                    } else {
                        fs.writeFile(thumbPath, defaultVideoThumb).then(() => {
                            resolve(thumbPath);
                        }).catch(reject)
                    }
                })
                .screenshots({
                    timestamps: [0],
                    filename: thumbFileName,
                    folder: thumb,
                    size: videoInfo.width + "x" + videoInfo.height
                }).on("end", () => {
                resolve(thumbPath);
            });
        })
        let thumbPath = new Map()
        const _thumbPath = await createThumb;
        const thumbSize = (await fs.stat(_thumbPath)).size;
        // log("生成缩略图", _thumbPath)
        thumbPath.set(0, _thumbPath)
        const thumbMd5 = await calculateFileMD5(_thumbPath);
        let element: SendVideoElement = {
            elementType: ElementType.VIDEO,
            elementId: "",
            videoElement: {
                fileName: fileName || _fileName,
                filePath: path,
                videoMd5: md5,
                thumbMd5,
                fileTime: videoInfo.time,
                thumbPath: thumbPath,
                thumbSize,
                thumbWidth: videoInfo.width,
                thumbHeight: videoInfo.height,
                fileSize: "" + fileSize,
                // fileUuid: "",
                // transferStatus: 0,
                // progress: 0,
                // invalidState: 0,
                // fileSubId: "",
                // fileBizId: null,
                // originVideoMd5: "",
                // fileFormat: 2,
                // import_rich_media_context: null,
                // sourceVideoCodecFormat: 2
            }
        }
        return element;
    }

    static async ptt(pttPath: string): Promise<SendPttElement> {
        const {converted, path: silkPath, duration} = await encodeSilk(pttPath);
        // log("生成语音", silkPath, duration);
        const {md5, fileName, path, fileSize} = await NTQQFileApi.uploadFile(silkPath, ElementType.PTT);
        if (fileSize === 0) {
            throw "文件异常，大小为0";
        }
        if (converted) {
            fs.unlink(silkPath).then();
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
                duration: duration,
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
            arkElement: {
                bytesData: data,
                linkInfo: null,
                subElementType: null
            }
        }
    }
}