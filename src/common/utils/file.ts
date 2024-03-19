import fs from "fs";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import util from "util";
import {encode, getDuration, isWav} from "silk-wasm";
import path from "node:path";
import {v4 as uuidv4} from "uuid";
import {DATA_DIR} from "./index";
import {log} from "./log";
import {getConfigUtil} from "../config";

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

export function checkFfmpeg(newPath: string = null): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (newPath) {
            ffmpeg.setFfmpegPath(newPath);
            ffmpeg.getAvailableFormats((err, formats) => {
                if (err) {
                    log('ffmpeg is not installed or not found in PATH:', err);
                    resolve(false)
                } else {
                    log('ffmpeg is installed.');
                    resolve(true);
                }
            })
        }
    });
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
        const fileName = path.basename(filePath);
        const pttPath = path.join(DATA_DIR, uuidv4());
        if (getFileHeader(filePath) !== "02232153494c4b") {
            log(`语音文件${filePath}需要转换成silk`)
            const _isWav = await isWavFile(filePath);
            const wavPath = pttPath + ".wav"
            if (!_isWav) {
                log(`语音文件${filePath}正在转换成wav`)
                // let voiceData = await fsp.readFile(filePath)
                await new Promise((resolve, reject) => {
                    const ffmpegPath = getConfigUtil().getConfig().ffmpeg;
                    if (ffmpegPath) {
                        ffmpeg.setFfmpegPath(ffmpegPath);
                    }
                    ffmpeg(filePath).toFormat("wav").audioChannels(2).on('end', function () {
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
            // const sampleRate = await getAudioSampleRate(filePath) || 0;
            // log("音频采样率", sampleRate)
            const pcm = fs.readFileSync(filePath);
            const silk = await encode(pcm, 0);
            fs.writeFileSync(pttPath, silk.data);
            fs.unlink(wavPath, (err) => {
            });
            log(`语音文件${filePath}转换成功!`, pttPath)
            return {
                converted: true,
                path: pttPath,
                duration: silk.duration,
            };
        } else {
            const pcm = fs.readFileSync(filePath);
            let duration = 0;
            try {
                duration = getDuration(pcm);
            } catch (e) {
                log("获取语音文件时长失败", filePath, e.stack)
                duration = fs.statSync(filePath).size / 1024 / 3  // 每3kb大约1s
                duration = Math.floor(duration)
                duration = Math.max(1, duration)
                log("使用文件大小估算时长", duration)
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

export async function getVideoInfo(filePath: string) {
    const size = fs.statSync(filePath).size;
    return new Promise<{
        width: number,
        height: number,
        time: number,
        format: string,
        size: number,
        filePath: string
    }>((resolve, reject) => {
        ffmpeg(filePath).ffprobe((err, metadata) => {
            if (err) {
                resolve({
                    width: 720, height: 1080,
                    time: 15,
                    format: "mp4",
                    size: fs.statSync(filePath).size,
                    filePath
                })
                // reject(err);
            } else {
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                if (videoStream) {
                    console.log(`视频尺寸: ${videoStream.width}x${videoStream.height}`);
                } else {
                    console.log('未找到视频流信息。');
                }
                resolve({
                    width: videoStream.width, height: videoStream.height,
                    time: parseInt(videoStream.duration),
                    format: metadata.format.format_name,
                    size,
                    filePath
                });
            }
        });
    })
}

export async function encodeMp4(filePath: string) {
    let videoInfo = await getVideoInfo(filePath);
    log("视频信息", videoInfo)
    if (videoInfo.format.indexOf("mp4") === -1) {
        log("视频需要转换为MP4格式", filePath)
        // 转成mp4
        const newPath: string = await new Promise<string>((resolve, reject) => {
            const newPath = filePath + ".mp4"
            ffmpeg(filePath)
                .toFormat('mp4')
                .on('error', (err) => {
                    reject(`转换视频格式失败: ${err.message}`);
                })
                .on('end', () => {
                    log('视频转换为MP4格式完成');
                    resolve(newPath); // 返回转换后的文件路径
                })
                .save(newPath);
        });
        return await getVideoInfo(newPath)
    }
    return videoInfo
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