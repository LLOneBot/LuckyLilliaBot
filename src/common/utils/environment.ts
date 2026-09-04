import { existsSync } from "fs"

export function isDockerEnvironment(): boolean {
    try {
        return existsSync('/.dockerenv')
    } catch {
        return false
    }
}

/** PMHQ 模式必须传 --pmhq-port (CLI/Desktop/docker 启动脚本都会带), 以此区分直连模式 */
export function isPmhqMode(): boolean {
    return process.argv.some(arg => arg.startsWith('--pmhq-port='))
}

/**
 * 从 process.argv 里解析指定 uin. 支持 4 种写法:
 *   -q <uin> / -q=<uin> / --qq <uin> / --qq=<uin>
 * 用于多账号场景: 指定一个 uin 后会读写对应的 qq-session-<uin>.json / config_<uin>.json。
 * 纯 argv 解析, 无依赖 (config service 也要用, 不能牵扯 native-sign 依赖链)。
 */
export function getSpecifiedUin(argv: string[] = process.argv): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if ((a === '-q' || a === '--qq') && i + 1 < argv.length) return argv[i + 1]
        if (a.startsWith('-q=')) return a.slice('-q='.length)
        if (a.startsWith('--qq=')) return a.slice('--qq='.length)
    }
    return undefined
}

export type Cdn = 'cf' | 'china'

/**
 * 解析接入点 CDN, 传给 SignProxy init。
 * 优先级: argv `--cdn china` / `--cdn=china` > 环境变量 CDN > 默认 cf。
 * 环境变量名 (CDN/cdn) 与值 (china/CHINA/...) 都大小写无关。
 * cf (默认) = api-auth.luckylillia.com; china = llbot-api-auth.wumiao.wang。
 * 非 cf/china 的值回退到 cf (SignProxy 侧还会再校验一次并对非法值报错)。
 */
export function getCdn(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Cdn {
    let raw: string | undefined
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--cdn' && i + 1 < argv.length) { raw = argv[i + 1]; break }
        if (a.startsWith('--cdn=')) { raw = a.slice('--cdn='.length); break }
    }
    // argv 未指定时回退环境变量; 变量名大小写无关 (CDN / cdn / Cdn 均可)
    if (raw === undefined) {
        const key = Object.keys(env).find(k => k.toLowerCase() === 'cdn')
        if (key) raw = env[key]
    }
    return raw?.trim().toLowerCase() === 'china' ? 'china' : 'cf'
}

export type ProtocolId = 'linux' | 'windows' | 'macos' | 'watch'

/**
 * 解析要用的协议 (进程级, 决定 appInfo profile + session 文件命名)。
 * 优先级: argv `--protocol <v>` / `--protocol=<v>` / `-p <v>` / `-p=<v>` > 环境变量 PROTOCOL > 默认 linux。
 * 值大小写无关, 支持别名: win/windows -> windows, mac/macos/darwin -> macos, wat/watch -> watch,
 * lnx/linux -> linux。非法/未指定一律回退 linux (向后兼容: 老部署不带 --protocol 仍跑 Linux)。
 * 纯 argv 解析, 无依赖 (config service / profile registry 都要用, 不能牵扯 native-sign 依赖链)。
 */
export function getProtocol(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): ProtocolId {
    let raw: string | undefined
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if ((a === '--protocol' || a === '-p') && i + 1 < argv.length) { raw = argv[i + 1]; break }
        if (a.startsWith('--protocol=')) { raw = a.slice('--protocol='.length); break }
        if (a.startsWith('-p=')) { raw = a.slice('-p='.length); break }
    }
    if (raw === undefined) {
        const key = Object.keys(env).find(k => k.toLowerCase() === 'protocol')
        if (key) raw = env[key]
    }
    switch (raw?.trim().toLowerCase()) {
        case 'win':
        case 'windows':
            return 'windows'
        case 'mac':
        case 'macos':
        case 'darwin':
            return 'macos'
        case 'wat':
        case 'watch':
            return 'watch'
        default:
            return 'linux'
    }
}