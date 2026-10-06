import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * SSO packet capture, off unless started with `--dump-packets[=<file.csv>]`.
 *
 * Hooked into packet.ts, the single encode/decode choke point: outbound rows are taken
 * before TEA, inbound rows after TEA + inflate, so every body in the CSV is plaintext.
 *
 * Keys go to a sibling `-keys.csv` because a body alone is not enough to replay the wire
 * bytes: the SSO layer is TEA(d2Key) once logged in and TEA(zero16) before that, and
 * wtlogin bodies hold two more layers (ECDH shareKey, then tgtgtKey for TLV 0x144/0x119).
 */

const FLAG = '--dump-packets'

const ENC_NAMES: Record<number, string> = { 0: 'none', 1: 'tea-d2key', 2: 'tea-empty16' }

const PACKET_HEADER =
  'idx,ts,dir,proto_ver,seq,cmd,ret_code,extra_msg,enc_type,sso_key_name,sso_key_hex,' +
  'inner_enc,inner_key_name,inner_key_hex,extra_layers,body_len,body_hex\n'
const KEY_HEADER = 'ts,name,len,hex,ascii,note\n'

function parseTargetPath(): string | null {
  for (const a of process.argv) {
    if (a === FLAG) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
      return join(resolve('data'), 'packets', `sso-${stamp}.csv`)
    }
    if (a.startsWith(`${FLAG}=`)) return resolve(a.slice(FLAG.length + 1))
  }
  return null
}

const target = parseTargetPath()
const keyTarget = target ? target.replace(/\.csv$/i, '') + '-keys.csv' : null

let ready = false
let idx = 0
// Live key material, kept so a wtlogin row can name the layers below the SSO frame.
const live = new Map<string, string>()

export function isPacketDumpEnabled(): boolean {
  return target !== null
}

function ensureReady(): void {
  if (ready || !target || !keyTarget) return
  ready = true
  const dir = dirname(target)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(target, PACKET_HEADER)
  appendFileSync(keyTarget, KEY_HEADER)
  console.log(`[packet-dump] packets -> ${target}`)
  console.log(`[packet-dump] keys    -> ${keyTarget}`)
}

function csv(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function row(file: string, fields: Array<string | number | undefined>): void {
  try {
    appendFileSync(file, fields.map(csv).join(',') + '\n')
  } catch {
    // A capture must never take the client down.
  }
}

/** Registers key material: one row in the keys CSV, and the live value for later packet rows. */
export function recordKey(name: string, value: Buffer | string, note = ''): void {
  if (!target) return
  ensureReady()
  const hex = Buffer.isBuffer(value) ? value.toString('hex') : value
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'hex')
  const ascii = buf.length > 0 && buf.every((b) => b >= 0x20 && b < 0x7f) ? buf.toString('latin1') : ''
  live.set(name, hex)
  row(keyTarget!, [new Date().toISOString(), name, buf.length, hex, ascii, note])
}

interface InnerLayers {
  innerEnc: string
  innerKeyName: string
  innerKeyHex: string
  extra: string
}

/**
 * wtlogin bodies are not protobuf: the body is a 0x02-framed wtlogin packet whose inner
 * block is TEA(ECDH shareKey), and wtlogin.login nests one more TEA(tgtgtKey) blob
 * (TLV 0x144 outbound, TLV 0x119 in the reply).
 */
function innerLayersFor(cmd: string): InnerLayers {
  if (!cmd.startsWith('wtlogin.')) return { innerEnc: '', innerKeyName: '', innerKeyHex: '', extra: '' }
  const share = live.get('ecdh.shareKey') ?? ''
  const tgtgt = live.get('tgtgtKey') ?? ''
  const extra = cmd === 'wtlogin.login' && tgtgt ? `tlv0x144/tlv0x119=tea(tgtgtKey=${tgtgt})` : ''
  return { innerEnc: 'tea', innerKeyName: 'ecdh.shareKey', innerKeyHex: share, extra }
}

function keyForEncType(encType: number, d2Key: Buffer): { name: string; hex: string } {
  if (encType === 1) return { name: 'd2Key', hex: d2Key.toString('hex') }
  if (encType === 2) return { name: 'empty16', hex: '00'.repeat(16) }
  return { name: '', hex: '' }
}

export interface SsoDumpArgs {
  seq: number
  cmd: string
  body: Buffer
  encType: number
  d2Key: Buffer
  protoVer: number
  retCode?: number
  extraMsg?: string
}

function dump(dir: 'out' | 'in', a: SsoDumpArgs): void {
  if (!target) return
  ensureReady()
  const key = keyForEncType(a.encType, a.d2Key)
  const inner = innerLayersFor(a.cmd)
  row(target, [
    ++idx,
    new Date().toISOString(),
    dir,
    a.protoVer,
    a.seq,
    a.cmd,
    a.retCode,
    a.extraMsg,
    `${a.encType}:${ENC_NAMES[a.encType] ?? 'unknown'}`,
    key.name,
    key.hex,
    inner.innerEnc,
    inner.innerKeyName,
    inner.innerKeyHex,
    inner.extra,
    a.body.length,
    a.body.toString('hex'),
  ])
}

/**
 * [SA 1001 调查] dump o3 命令的**完整未加密 SSO 帧** (head+reserve+SecInfo+body) 到 side log,
 * 用来跟真机 scan.pcap 逐字节 diff (CSV 只记 body, 看不到 reserve/SecInfo)。仅 --dump-packets 时开。
 */
export function dumpFullFrame(cmd: string, ssoFrame: Buffer): void {
  if (!target) return
  ensureReady()
  try {
    const p = target!.replace(/sso-[^/\\]*\.csv$/i, 'o3_fullframe.log')
    appendFileSync(p, `${new Date().toISOString()} ${cmd} ${ssoFrame.toString('hex')}\n`)
  } catch {
    // never take the client down
  }
}

export function dumpSsoOut(a: SsoDumpArgs): void {
  dump('out', a)
}

export function dumpSsoIn(a: SsoDumpArgs): void {
  dump('in', a)
}
