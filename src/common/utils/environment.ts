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