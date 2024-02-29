export interface OB11Config {
    httpPort: number
    httpHosts: string[]
    wsPort: number
    wsHosts: string[]
    enableHttp?: boolean
    enableHttpPost?: boolean
    enableWs?: boolean
    enableWsReverse?: boolean
    messagePostFormat?: 'array' | 'string'
}

export interface Config {
    ob11: OB11Config
    token?: string
    heartInterval?: number  // ms
    enableLocalFile2Url?: boolean  // 开启后，本地文件路径图片会转成http链接, 语音会转成base64
    debug?: boolean
    reportSelfMessage?: boolean
    log?: boolean
    autoDeleteFile?: boolean
    ffmpeg?: string  // ffmpeg路径
}

export type LLOneBotError = {
    ffmpegError?: string
    otherError?: string
}