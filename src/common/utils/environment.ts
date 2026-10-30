import { existsSync } from "fs"

export function isDockerEnvironment(): boolean {
    try {
        return existsSync('/.dockerenv')
    } catch {
        return false
    }
}

/** PMHQ now runs inside this process. Obsolete network flags fail explicitly. */
export function getPmhqTarget(argv: string[] = process.argv): { configPath: string; qqPath: string } | null {
    if (argv.some(a => /^--pmhq-(host|port)(=|$)/.test(a))) {
        throw new Error('PMHQ 已迁移到进程内模块，--pmhq-host / --pmhq-port 不再支持；请改用 --pmhq --pmhq-config=<配置文件绝对路径>')
    }
    const arg = (name: string) => {
        const equals = argv.find(a => a.startsWith(name + '='))
        if (equals) return equals.slice(name.length + 1)
        const index = argv.indexOf(name)
        return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('-') ? argv[index + 1] : ''
    }
    const configPath = arg('--pmhq-config')
    return argv.includes('--pmhq') || !!configPath ? { configPath, qqPath: arg('--qq-path') } : null
}

export type ProtocolMode = 'direct' | 'pmhq'

/** How the NT protocol plugin logs in: the pure protocol speaking `protocol`, or PMHQ bridging an official QQ client. */
export interface ProtocolSelection {
    mode: ProtocolMode
    protocol: ProtocolId
    pmhq: { configPath: string; qqPath: string }
}

/**
 * What the launch fixes, and by what (a flag, an environment variable, or `desktop` for the LuckyLillia desktop
 * app), so the WebUI shows it read-only instead of saving what would not apply.
 */
export interface ProtocolPins {
    mode?: { value: ProtocolMode; by: string }
    protocol?: { value: ProtocolId; by: string }
    pmhq?: { value: { configPath: string; qqPath: string }; by: string }
}

let selection: ProtocolSelection | undefined
let locked: ProtocolId | undefined
let launch: ProtocolPins | undefined

export function protocolPins(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): ProtocolPins {
    const pins: ProtocolPins = {}
    // The desktop app passes these flags itself, so that is where they are changed
    const flag = (name: string) => env.LL_IPC_PIPE ? 'desktop' : name
    const target = getPmhqTarget(argv)
    if (target) {
        pins.mode = { value: 'pmhq', by: flag('--pmhq') }
        pins.pmhq = { value: target, by: flag('--pmhq') }
    } else if (env.LL_IPC_PIPE) {
        // The desktop selects its native bridge with --pmhq; otherwise it runs the pure protocol
        pins.mode = { value: 'direct', by: 'desktop' }
    }
    const protocol = pinnedProtocol(argv, env)
    if (protocol) pins.protocol = { ...protocol, by: protocol.by.startsWith('-') ? flag(protocol.by) : protocol.by }
    return pins
}

/** protocolPins() of this process, read once: getProtocol() runs for every packet, and argv does not change. */
export function launchPins(): ProtocolPins {
    return launch ??= protocolPins()
}

/** The NT protocol plugin's settings, with what the launch fixes winning. */
export function resolveProtocolSelection(settings: ProtocolSelection, pins: ProtocolPins = launchPins()): ProtocolSelection {
    return {
        mode: pins.mode?.value ?? settings.mode,
        protocol: pins.protocol?.value ?? settings.protocol,
        pmhq: pins.pmhq?.value ?? settings.pmhq,
    }
}

/** Set by the NT protocol plugin before it mounts the protocol; until then the launch arguments decide. */
export function setProtocolSelection(value: ProtocolSelection) {
    selection = value
}

/**
 * Called as the pure protocol's client is created: the client lives as long as the process (native sign binds
 * its relay to it), and so does the protocol it speaks.
 */
export function lockProtocol() {
    locked ??= getProtocol()
}

/** What the pure protocol is locked to until LLBot restarts; undefined while it has no client. */
export function lockedProtocol(): ProtocolId | undefined {
    return locked
}

export function isPmhqMode(): boolean {
    return selection ? selection.mode === 'pmhq' : getPmhqTarget() !== null
}

export function currentPmhqTarget(): { configPath: string; qqPath: string } {
    return selection?.pmhq ?? getPmhqTarget() ?? { configPath: '', qqPath: '' }
}

/**
 * `--dev`: run against a local manager -- loads the development native bundle and reads data/auth_token.dev.txt.
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

/** The manager frontend, on a different domain from the API host the native signing module talks to. */
export function getAuthTokenPageUrl(cdn: Cdn = getCdn()): string {
    return cdn === 'china' ? 'https://llbot.wumiao.wang' : 'https://auth.luckylillia.com'
}

export type ProtocolId = 'linux' | 'windows' | 'macos' | 'watch'

/**
 * The profile the protocol layer runs with. The pure protocol: what it is locked to, else `--protocol` / `-p` >
 * the PROTOCOL environment variable > the NT protocol plugin's choice > linux; an unknown value is linux too, old
 * deployments have no --protocol. PMHQ has always run with linux unless launched with another (highway appId,
 * SsoInfoSync), so switching to it keeps that.
 */
export function getProtocol(): ProtocolId {
    const pinned = launchPins().protocol?.value
    if (selection?.mode === 'pmhq') return pinned ?? 'linux'
    return locked ?? pinned ?? selection?.protocol ?? 'linux'
}

/** A blank value pins nothing, e.g. PROTOCOL= from a compose file whose variable is unset. */
function pinnedProtocol(argv: string[], env: NodeJS.ProcessEnv): { value: ProtocolId; by: string } | undefined {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        let raw: string | undefined
        let by = a
        if (a === '--protocol' || a === '-p') raw = argv[i + 1]
        else if (a.startsWith('--protocol=')) [by, raw] = ['--protocol', a.slice('--protocol='.length)]
        else if (a.startsWith('-p=')) [by, raw] = ['-p', a.slice('-p='.length)]
        if (raw?.trim()) return { value: normalizeProtocol(raw), by }
    }
    const key = Object.keys(env).find(k => k.toLowerCase() === 'protocol')
    const raw = key ? env[key] : undefined
    if (key && raw?.trim()) return { value: normalizeProtocol(raw), by: key }
}

function normalizeProtocol(raw: string): ProtocolId {
    switch (raw.trim().toLowerCase()) {
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