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