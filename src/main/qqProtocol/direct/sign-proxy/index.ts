import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireBin = createRequire(import.meta.url)

function pickTriple(): string {
  const p = process.platform
  const a = process.arch
  if (p === 'win32' && a === 'x64') return 'win-x64'
  if (p === 'win32' && a === 'arm64') return 'win-arm64'
  if (p === 'linux' && a === 'x64') return 'linux-x64'
  if (p === 'linux' && a === 'arm64') return 'linux-arm64'
  if (p === 'darwin' && a === 'x64') return 'darwin-x64'
  if (p === 'darwin' && a === 'arm64') return 'darwin-arm64'
  throw new Error(`sign-proxy: unsupported platform ${p}-${a}; rebuild lucky-lillia-sign-proxy on this target and drop the .node into ${here}`)
}

interface Native {
  init(args: InitArgs, sendPacket: (p: RelayPacket) => Promise<Buffer>, logger: (log: SignLog) => void): Promise<void>
  ping(): string
  setAuthToken(authToken: string): Promise<void>
  /** 运行中切换 16B device GUID (hex). 老版 .node 没这 export 时 swallow. */
  setMachineGuid?(guidHex: string): void
  preflight(): Promise<string | null>
  signRequest(args: SignRequestArgs): Promise<SignResultJs>
  acquireSignToken(args: AcquireSignTokenArgs): Promise<AcquireSignTokenResult>
  postEnvelope(args: PostEnvelopeArgs): Promise<string>
}

const triple = pickTriple()
const binPath = join(here, `sign-proxy.${triple}.node`)
let native: Native
try {
  native = requireBin(binPath) as Native
} catch (e) {
  throw new Error(`sign-proxy: failed to load ${binPath}: ${(e as Error).message}`)
}

export interface InitArgs {
  botVersion: string
  /** manager JWT. */
  authToken: string
  /** 16B device GUID hex (32 chars). 跟 wtlogin client.guid 同源. */
  machineGuidHex: string
  /** 当前账号 uin, 可选; 没有就等登录完成 SignProxy 自己绑. */
  uin?: number
}

/** 发包回调入参: 把 body relay 给 QQ 的 cmd. */
export interface RelayPacket {
  cmd: string
  body: Buffer
}

/** SDK logger 回调入参: level 是 "warn" / "error". 401/403 fatal 时 SDK 报 error 然后 exit. */
export interface SignLog {
  level: string
  message: string
}

export interface SignRequestArgs {
  cmd: string
  bodyHex: string
  seq: number
  guidHex: string
  qua: string
  uin: number
  /** QQ 12B session token 的 utf-8 hex (登录后由 acquireSignToken 拿到). 登录前传 "". */
  protocolTokenHex: string
}

export interface SignResultJs {
  sign: Buffer
  token: Buffer
  extra: Buffer
}

export interface AcquireSignTokenArgs {
  uin: number
  qua: string
}

/** acquireSignToken 返回: 12B token + QQ 下发的 TTL(秒, 0 = native 没解析到 ESK field 3). */
export interface AcquireSignTokenResult {
  token: Buffer
  ttlSecs: number
}

export interface PostEnvelopeArgs {
  path: string
  plaintextJson: string
}

export const init = native.init
export const ping = native.ping
export const setAuthToken = native.setAuthToken
export const setMachineGuid = native.setMachineGuid
export const preflight = native.preflight
export const signRequest = native.signRequest
export const acquireSignToken = native.acquireSignToken
export const postEnvelope = native.postEnvelope
