import { existsSync } from "fs"

export function isDockerEnvironment(): boolean {
    try {
        return existsSync('/.dockerenv')
    } catch {
        return false
    }
}

/** null = 直连。出现过 --pmhq-port 就算 PMHQ 模式, 没给值用默认端口: 写法不对也不能静默退回直连 */
export function getPmhqTarget(argv: string[] = process.argv): { host: string; port: string } | null {
    let requested = false
    let port = '13000'
    let host = '127.0.0.1'
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        // 值不能是下一个 flag: `--pmhq-port --dev` 不该把 "--dev" 当端口
        const next = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : undefined
        if (a === '--pmhq-port') {
            requested = true
            if (next) port = next
        } else if (a.startsWith('--pmhq-port=')) {
            requested = true
            const v = a.slice('--pmhq-port='.length)
            if (v) port = v
        } else if (a === '--pmhq-host') {
            if (next) host = next
        } else if (a.startsWith('--pmhq-host=')) {
            const v = a.slice('--pmhq-host='.length)
            if (v) host = v
        }
    }
    return requested ? { host, port } : null
}

export function isPmhqMode(): boolean {
    return getPmhqTarget() !== null
}

/**
 * `--dev`: run against a local manager -- loads the dev sign-proxy build and reads data/auth_token.dev.txt.
 * argv only, no env fallback: a stray variable on a deployment must never switch it on.
 */
export function isDevMode(argv: string[] = process.argv): boolean {
    return argv.includes('--dev')
}

/** Extra plugin roots besides data/plugins: `--plugin-dir <path>`, repeatable. */
export function getPluginDirs(argv: string[] = process.argv): string[] {
    const dirs: string[] = []
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        const next = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : undefined
        if (a === '--plugin-dir') {
            if (next) dirs.push(next)
        } else if (a.startsWith('--plugin-dir=')) {
            const v = a.slice('--plugin-dir='.length)
            if (v) dirs.push(v)
        }
    }
    return dirs
}

/** `--instance <name>` / `--instance=<name>`, else `LLBOT_INSTANCE`. Resolved against data/ in common/instance.ts. */
export function getInstanceArg(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--instance' && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1]
        if (a.startsWith('--instance=')) return a.slice('--instance='.length) || undefined
    }
    return env.LLBOT_INSTANCE || undefined
}

/** `--plugin-hmr`: watch the plugin roots and hot-reload a package when its files change. */
export function isPluginHmr(argv: string[] = process.argv): boolean {
    return argv.includes('--plugin-hmr')
}

/**
 * `-q <uin>` / `--qq <uin>`: 用 qq-session-<uin>[-<protocol>].json; 没给 --instance 时有同名实例就用它。
 * 只解析 argv: config service 也用它, 不能牵扯 native-sign 依赖链
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

/** `--cdn` > 环境变量 CDN (名和值不分大小写) > cf。cf = api-auth.luckylillia.com, china = llbot-api-auth.wumiao.wang */
export function getCdn(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): Cdn {
    let raw: string | undefined
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--cdn' && i + 1 < argv.length) { raw = argv[i + 1]; break }
        if (a.startsWith('--cdn=')) { raw = a.slice('--cdn='.length); break }
    }
    if (raw === undefined) {
        const key = Object.keys(env).find(k => k.toLowerCase() === 'cdn')
        if (key) raw = env[key]
    }
    return raw?.trim().toLowerCase() === 'china' ? 'china' : 'cf'
}

/** The manager frontend, on a different domain from the API host SignProxy talks to. */
export function getAuthTokenPageUrl(cdn: Cdn = getCdn()): string {
    return cdn === 'china' ? 'https://llbot.wumiao.wang' : 'https://auth.luckylillia.com'
}

export type ProtocolId = 'linux' | 'windows' | 'macos' | 'watch'

/** `--protocol` / `-p` > 环境变量 PROTOCOL > linux。非法值也回退 linux: 老部署不带 --protocol */
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