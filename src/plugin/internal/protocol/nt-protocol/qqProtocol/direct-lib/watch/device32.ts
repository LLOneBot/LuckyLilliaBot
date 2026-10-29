import { createHash } from 'node:crypto'

/**
 * watch sign 的 32B 设备身份: sign-service 拿它派生 device_blob 做设备绑定, 必须跨重启稳定, 所以从 machine guid
 * 派生。跟 LuckyLillia.Sign 的 device32_from_guid 逐字节一致, 改了就是换设备身份
 */
export function device32FromGuid(guid: Buffer): Buffer {
  const half = (salt: string) => createHash('md5').update(salt).update(guid).digest()
  return Buffer.concat([half('watchqq-d32-a:'), half('watchqq-d32-b:')])
}
