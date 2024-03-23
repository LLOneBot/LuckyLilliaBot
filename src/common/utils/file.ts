import fs from "fs";
import fsPromise from "fs/promises";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import util from "util";
import {encode, getDuration, isWav, getWavFileInfo} from "silk-wasm";
import path from "node:path";
import {v4 as uuidv4} from "uuid";
import {checkFfmpeg, DATA_DIR, log, TEMP_DIR} from "./index";
import {getConfigUtil} from "../config";
import {dbUtil} from "../db";
import * as fileType from "file-type";
import {net} from "electron";


export function isGIF(path: string) {
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer.toString() === 'GIF8'
}

// 定义一个异步函数来检查文件是否存在
export function checkFileReceived(path: string, timeout: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            if (fs.existsSync(path)) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`文件不存在: ${path}`));
            } else {
                setTimeout(check, 100);
            }
        }

        check();
    });
}

export async function file2base64(path: string) {
    const readFile = util.promisify(fs.readFile);
    let result = {
        err: "",
        data: ""
    }
    try {
        // 读取文件内容
        // if (!fs.existsSync(path)){
        //     path = path.replace("\\Ori\\", "\\Thumb\\");
        // }
        try {
            await checkFileReceived(path, 5000);
        } catch (e: any) {
            result.err = e.toString();
            return result;
        }
        const data = await readFile(path);
        // 转换为Base64编码
        result.data = data.toString('base64');
    } catch (err) {
        result.err = err.toString();
    }
    return result;
}

export async function encodeSilk(filePath: string) {
    const fsp = require("fs").promises

    function getFileHeader(filePath: string) {
        // 定义要读取的字节数
        const bytesToRead = 7;
        try {
            const buffer = fs.readFileSync(filePath, {
                encoding: null,
                flag: "r",
            });

            const fileHeader = buffer.toString("hex", 0, bytesToRead);
            return fileHeader;
        } catch (err) {
            console.error("读取文件错误:", err);
            return;
        }
    }

    async function isWavFile(filePath: string) {
        return isWav(fs.readFileSync(filePath));
    }

    async function guessDuration(pttPath: string) {
        const pttFileInfo = await fsPromise.stat(pttPath)
        let duration = pttFileInfo.size / 1024 / 3  // 3kb/s
        duration = Math.floor(duration)
        duration = Math.max(1, duration)
        log(`通过文件大小估算语音的时长:`, duration)
        return duration
    }

    // function verifyDuration(oriDuration: number, guessDuration: number) {
    //     // 单位都是秒
    //     if (oriDuration - guessDuration > 10) {
    //         return guessDuration
    //     }
    //     oriDuration = Math.max(1, oriDuration)
    //     return oriDuration
    // }
    // async function getAudioSampleRate(filePath: string) {
    //     try {
    //         const mm = await import('music-metadata');
    //         const metadata = await mm.parseFile(filePath);
    //         log(`${filePath}采样率`, metadata.format.sampleRate);
    //         return metadata.format.sampleRate;
    //     } catch (error) {
    //         log(`${filePath}采样率获取失败`, error.stack);
    //         // console.error(error);
    //     }
    // }

    try {
        const pttPath = path.join(DATA_DIR, uuidv4());
        if (getFileHeader(filePath) !== "02232153494c4b") {
            log(`语音文件${filePath}需要转换成silk`)
            const _isWav = await isWavFile(filePath);
            const wavPath = pttPath + ".wav"
            const convert = async () => {
                return await new Promise((resolve, reject) => {
                    const ffmpegPath = getConfigUtil().getConfig().ffmpeg;
                    if (ffmpegPath) {
                        ffmpeg.setFfmpegPath(ffmpegPath);
                    }
                    ffmpeg(filePath).toFormat("wav").audioChannels(1).audioFrequency(24000).on('end', function () {
                        log('wav转换完成');
                    })
                        .on('error', function (err) {
                            log(`wav转换出错: `, err.message,);
                            reject(err);
                        })
                        .save(wavPath)
                        .on("end", () => {
                            filePath = wavPath
                            resolve(wavPath);
                        });
                })
            }
            let wav: Buffer
            if (!_isWav) {
                log(`语音文件${filePath}正在转换成wav`)
                await convert()
            } else {
                wav = fs.readFileSync(filePath)
                const allowSampleRate = [8000, 12000, 16000, 24000, 32000, 44100, 48000]
                const { fmt } = getWavFileInfo(wav)
                if (!allowSampleRate.includes(fmt.sampleRate)) {
                    wav = undefined
                    await convert()
                }
            }
            wav ||= fs.readFileSync(filePath);
            const silk = await encode(wav, 0);
            fs.writeFileSync(pttPath, silk.data);
            fs.unlink(wavPath, (err) => {
            });
            const gDuration = await guessDuration(pttPath)
            log(`语音文件${filePath}转换成功!`, pttPath, `时长:`, silk.duration)
            return {
                converted: true,
                path: pttPath,
                duration: silk.duration / 1000
            };
        } else {
            const silk = fs.readFileSync(filePath);
            let duration = 0;
            const gDuration = await guessDuration(filePath)
            try {
                duration = getDuration(silk) / 1000
            } catch (e) {
                log("获取语音文件时长失败, 使用文件大小推测时长", filePath, e.stack)
                duration = gDuration;
            }

            return {
                converted: false,
                path: filePath,
                duration: duration,
            };
        }
    } catch (error) {
        log("convert silk failed", error.stack);
        return {};
    }
}



export function calculateFileMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // 创建一个流式读取器
        const stream = fs.createReadStream(filePath);
        const hash = crypto.createHash('md5');

        stream.on('data', (data: Buffer) => {
            // 当读取到数据时，更新哈希对象的状态
            hash.update(data);
        });

        stream.on('end', () => {
            // 文件读取完成，计算哈希
            const md5 = hash.digest('hex');
            resolve(md5);
        });

        stream.on('error', (err: Error) => {
            // 处理可能的读取错误
            reject(err);
        });
    });
}

export interface HttpDownloadOptions {
    url: string;
    headers?: Record<string, string> | string;
}
export async function httpDownload(options: string | HttpDownloadOptions): Promise<Buffer> {
    let chunks: Buffer[] = [];
    let url: string;
    let headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36"
    };
    if (typeof options === "string") {
        url = options;
    } else {
        url = options.url;
        if (options.headers) {
            if (typeof options.headers === "string") {
                headers = JSON.parse(options.headers);
            } else {
                headers = options.headers;
            }
        }
    }
    const fetchRes = await net.fetch(url, headers);
    if (!fetchRes.ok) throw new Error(`下载文件失败: ${fetchRes.statusText}`)

    const blob = await fetchRes.blob();
    let buffer = await blob.arrayBuffer();
    return Buffer.from(buffer);
}

type Uri2LocalRes = {
    success: boolean,
    errMsg: string,
    fileName: string,
    ext: string,
    path: string,
    isLocal: boolean
}

export async function uri2local(uri: string, fileName: string = null): Promise<Uri2LocalRes> {
    let res = {
        success: false,
        errMsg: "",
        fileName: "",
        ext: "",
        path: "",
        isLocal: false
    }
    if (!fileName) {
        fileName = uuidv4();
    }
    let filePath = path.join(TEMP_DIR, fileName)
    let url = null;
    try {
        url = new URL(uri);
    } catch (e) {
        res.errMsg = `uri ${uri} 解析失败,` + e.toString() + ` 可能${uri}不存在`
        return res
    }

    // log("uri protocol", url.protocol, uri);
    if (url.protocol == "base64:") {
        // base64转成文件
        let base64Data = uri.split("base64://")[1]
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filePath, buffer);

        } catch (e: any) {
            res.errMsg = `base64文件下载失败,` + e.toString()
            return res
        }
    } else if (url.protocol == "http:" || url.protocol == "https:") {
        // 下载文件
        let buffer: Buffer = null;
        try {
            buffer = await httpDownload(uri);
        } catch (e) {
            res.errMsg = `${url}下载失败,` + e.toString()
            return res
        }
        try {
            const pathInfo = path.parse(decodeURIComponent(url.pathname))
            if (pathInfo.name) {
                fileName = pathInfo.name
                if (pathInfo.ext) {
                    fileName += pathInfo.ext
                    // res.ext = pathInfo.ext
                }
            }
            res.fileName = fileName
            filePath = path.join(TEMP_DIR, uuidv4() + fileName)
            fs.writeFileSync(filePath, buffer);
        } catch (e: any) {
            res.errMsg = `${url}下载失败,` + e.toString()
            return res
        }
    } else {
        let pathname: string;
        if (url.protocol === "file:") {
            // await fs.copyFile(url.pathname, filePath);
            pathname = decodeURIComponent(url.pathname)
            if (process.platform === "win32") {
                filePath = pathname.slice(1)
            } else {
                filePath = pathname
            }
        } else {
            const cache = await dbUtil.getFileCache(uri);
            if (cache) {
                filePath = cache.filePath
            } else {
                filePath = uri;
            }
        }

        res.isLocal = true
    }
    // else{
    //     res.errMsg = `不支持的file协议,` + url.protocol
    //     return res
    // }
    // if (isGIF(filePath) && !res.isLocal) {
    //     await fs.rename(filePath, filePath + ".gif");
    //     filePath += ".gif";
    // }
    if (!res.isLocal && !res.ext) {
        try {
            let ext: string = (await fileType.fileTypeFromFile(filePath)).ext
            if (ext) {
                log("获取文件类型", ext, filePath)
                fs.renameSync(filePath, filePath + `.${ext}`)
                filePath += `.${ext}`
                res.fileName += `.${ext}`
                res.ext = ext
            }
        } catch (e) {
            // log("获取文件类型失败", filePath,e.stack)
        }
    }
    res.success = true
    res.path = filePath
    return res
}

export async function copyFolder(sourcePath: string, destPath: string) {
    try {
        const entries = await fsPromise.readdir(sourcePath, {withFileTypes: true});
        await fsPromise.mkdir(destPath, {recursive: true});
        for (let entry of entries) {
            const srcPath = path.join(sourcePath, entry.name);
            const dstPath = path.join(destPath, entry.name);
            if (entry.isDirectory()) {
                await copyFolder(srcPath, dstPath);
            } else {
                try {
                    await fsPromise.copyFile(srcPath, dstPath);
                } catch (error) {
                    console.error(`无法复制文件 '${srcPath}' 到 '${dstPath}': ${error}`);
                    // 这里可以决定是否要继续复制其他文件
                }
            }
        }
    } catch (error) {
        console.error('复制文件夹时出错:', error);
    }
}