// Persistent 16B machine GUID for sign-token protocol layer.
//
// 等价于 wrapper.node 的 machine_guid_util.cc:GetMachineGuidArray (sub_76D5D70):
// 持久化在文件里, 没文件时随机生成. SsoKeyExchange request 内层 v68 PB 的 field 2
// 必须是这个值 -- server 用作设备指纹, 一致性影响登录成功率/风控.
//
// 我们的存储位置是 data/machine_guid.bin (16B raw). 跟 QQ NT 自己的 GUID 文件
// 不共享 -- Bot 是独立设备身份, 不需要伪装成同一台机器. 但同一个 Bot 重启后
// **必须** 拿到同一个 GUID, 否则 server 看到 sign-token 上的 client_pub 跟 GUID
// 跨重启不一致, 风控会标记.

import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'

const DEFAULT_FILE = path.resolve('data/machine_guid.bin')

/**
 * 加载或生成 16B machine GUID. 第一次调用如果文件不存在就 random + 写盘,
 * 后续调用读盘. 多个并发调用是 race-safe -- 同一进程内多次调用复用 cache,
 * 跨进程 race 时谁后写谁赢 (单 Bot 进程不会有这个问题).
 */
let cached: Buffer | null = null

export async function loadMachineGuid(filePath: string = DEFAULT_FILE): Promise<Buffer> {
  if (cached) return cached
  try {
    const buf = await fs.readFile(filePath)
    if (buf.length === 16) {
      cached = buf
      return buf
    }
    // 文件存在但长度不对 -- 保守起见: 备份再重建
    const backup = `${filePath}.bad-${Date.now()}`
    await fs.rename(filePath, backup).catch(() => {})
    console.warn(`[MachineGuid] ${filePath} length=${buf.length} (expect 16), backed up to ${backup}, regenerating`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e
    }
  }
  // 文件不存在 (或损坏被备份了) -- 随机生成
  const guid = randomBytes(16)
  await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {})
  await fs.writeFile(filePath, guid)
  console.log(`[MachineGuid] generated new 16B GUID -> ${filePath}`)
  cached = guid
  return guid
}
