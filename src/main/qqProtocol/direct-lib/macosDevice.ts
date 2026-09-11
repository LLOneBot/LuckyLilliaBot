// macOS 设备身份 (qimei36 + device_pb), 持久化到 data/macos_device.json。
//
// 为什么要落盘: qimei 取号是一次**真实的设备注册**, 每次启动都重新注册 = 同一个人不断在腾讯
// 那边冒出新设备。device_pb 虽然是从 machine guid 确定性派生的 (重算也一样), 但它把 qimei36
// 包在里面, 所以跟 qimei 一起存。
//
// 身份必须全程同一台: ESK / A2Establish / SA2 三步喂同一份 device_pb, 且它跟 wtlogin/SSO 用的
// 是同一个 machine guid 派生 —— 混着来服务端当嵌合体拒 (NTQQSign 铁律 §9)。
//
// 只在 --protocol macos 下用到; 其它协议不会碰这个文件。

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { getLogger } from '@/common/logger'
import { getSignProxy } from './sign-proxy'
import { loadMachineGuid } from './machineGuid'

const logger = getLogger('macos-device')

const DEFAULT_FILE = path.resolve('data/macos_device.json')

interface MacosDeviceFile {
  /// StarTrail 取号拿到的 36 位, 进 device_pb k31。
  qimei36: string
  /// 组这份 device_pb 时用的 QUA。QUA 变了要重组 (k32 在里面)。
  qua: string
  /// device_pb hex, 三步 o3 共用。
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
  // QUA 升级后 device_pb 里的 k32 就过期了, 重组 (qimei36 仍可复用, 不用重新注册设备)。
  if (parsed.qua !== qua) {
    logger.info(`[MacosDevice] QUA 变了 (${parsed.qua} -> ${qua}), 重组 device_pb (qimei 复用)`)
    return null
  }
  return { qimei36: parsed.qimei36, devicePbHex: parsed.devicePbHex }
}

async function build(file: string, qua: string): Promise<MacosDevice> {
  const proxy = getSignProxy()
  if (typeof proxy.getMacosQimei !== 'function' || typeof proxy.buildMacosDevicePb !== 'function') {
    throw new Error('sign-proxy .node 过旧 (缺 getMacosQimei / buildMacosDevicePb), 请重新 build 并 sync-to-bot')
  }

  const cached = await readFileIfUsable(file, qua)
  if (cached) return cached

  // machine guid = 全链路同一台设备的锚点, wtlogin/SSO 也用它。
  const seedHex = (await loadMachineGuid()).toString('hex')

  // 旧文件里有 qimei36 就复用 —— 只是 QUA 变了要重组 device_pb, 没必要再注册一次设备。
  let qimei36 = ''
  try {
    const prev = JSON.parse(await fs.readFile(file, 'utf-8')) as Partial<MacosDeviceFile>
    if (prev.qimei36) qimei36 = prev.qimei36
  } catch {
    // 没有旧文件 / 读不动: 下面重新取号
  }
  if (!qimei36) {
    qimei36 = (await proxy.getMacosQimei({ seedHex })).qimei36
    logger.info(`[MacosDevice] qimei 取号完成 (${qimei36})`)
  }

  const devicePbHex = proxy.buildMacosDevicePb({ seedHex, qua, q36: qimei36 })

  const out: MacosDeviceFile = { qimei36, qua, devicePbHex }
  await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {})
  await fs.writeFile(file, JSON.stringify(out, null, 2))
  logger.info(`[MacosDevice] device_pb ${devicePbHex.length / 2}B -> ${file}`)
  return { qimei36, devicePbHex }
}

/**
 * 拿本机的 macOS 设备身份。首次会联网取号 (走本机出口, 不经服务端), 之后读盘。
 * 并发调用共享同一次 in-flight, 不会重复注册设备。
 */
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

/** 测试用: 清进程内缓存。生产代码不该调。 */
export function _resetMacosDeviceCacheForTest(): void {
  cache = null
  inflight = null
}
