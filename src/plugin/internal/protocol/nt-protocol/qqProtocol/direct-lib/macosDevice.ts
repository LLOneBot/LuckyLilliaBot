// macOS 设备身份 (qimei36 + device_pb) 存在 data/macos_device.json: qimei 取号是一次真实的设备注册, 不能每次启动都取。
// ESK / A2Establish / SA2 用同一份 device_pb, 且跟 wtlogin / SSO 是同一个 machine guid 派生, 混用会被当嵌合体拒

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { getLogger } from '@/common/logger'
import { getNativeAddon } from '@/native'
import { loadMachineGuid } from './machineGuid'

const logger = getLogger('macos-device')

const DEFAULT_FILE = path.resolve('data/macos_device.json')

interface MacosDeviceFile {
  /// StarTrail 取号拿到的 36 位, 进 device_pb k31。
  qimei36: string
  /// 组这份 device_pb 时用的 QUA。QUA 变了要重组 (k32 在里面)。
  qua: string
  devicePbHex: string
}

export interface MacosDevice {
  qimei36: string
  devicePbHex: string
}

let cache: MacosDevice | null = null
let inflight: Promise<MacosDevice> | null = null

async function readFileIfUsable(file: string, qua: string): Promise<MacosDevice | null> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return null
  }
  let parsed: Partial<MacosDeviceFile>
  try {
    parsed = JSON.parse(raw)
  } catch {
    logger.warn(`[MacosDevice] ${file} 不是合法 JSON, 重新取号`)
    return null
  }
  if (!parsed.qimei36 || !parsed.devicePbHex) return null
  if (parsed.qua !== qua) {
    logger.info(`[MacosDevice] QUA 变了 (${parsed.qua} -> ${qua}), 重组 device_pb (qimei 复用)`)
    return null
  }
  return { qimei36: parsed.qimei36, devicePbHex: parsed.devicePbHex }
}

async function build(file: string, qua: string): Promise<MacosDevice> {
  const proxy = getNativeAddon()
  if (typeof proxy.getMacosQimei !== 'function' || typeof proxy.buildMacosDevicePb !== 'function') {
    throw new Error('LuckyLillia.NTQQ.node 过旧 (缺 getMacosQimei / buildMacosDevicePb), 请重新 build 并 sync-to-bot')
  }

  const cached = await readFileIfUsable(file, qua)
  if (cached) return cached

  const seedHex = (await loadMachineGuid()).toString('hex')

  let qimei36 = ''
  try {
    const prev = JSON.parse(await fs.readFile(file, 'utf-8')) as Partial<MacosDeviceFile>
    if (prev.qimei36) qimei36 = prev.qimei36
  } catch {
    // 没有旧文件 / 读不动: 下面重新取号
  }
  if (!qimei36) {
    qimei36 = (await proxy.getMacosQimei({ seedHex, qua })).qimei36
    logger.info(`[MacosDevice] qimei 取号完成 (${qimei36})`)
  }

  const devicePbHex = proxy.buildMacosDevicePb({ seedHex, qua, q36: qimei36 })

  const out: MacosDeviceFile = { qimei36, qua, devicePbHex }
  await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {})
  await fs.writeFile(file, JSON.stringify(out, null, 2))
  logger.info(`[MacosDevice] device_pb ${devicePbHex.length / 2}B -> ${file}`)
  return { qimei36, devicePbHex }
}

/** 首次联网取号 (走本机出口), 之后读盘; 并发调用共享一次取号 */
export async function getMacosDevice(qua: string, filePath: string = DEFAULT_FILE): Promise<MacosDevice> {
  if (cache) return cache
  if (inflight) return inflight
  const file = path.resolve(filePath)
  inflight = build(file, qua)
    .then((d) => {
      cache = d
      return d
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function _resetMacosDeviceCacheForTest(): void {
  cache = null
  inflight = null
}
