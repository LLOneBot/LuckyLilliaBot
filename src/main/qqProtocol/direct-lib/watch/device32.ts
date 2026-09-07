import { createHash } from 'node:crypto'

/**
 * watch sign 要的 32B 设备身份 (device32)。
 *
 * 真机上它是一个独立的稳定 GUID —— 任何稳定的 32 字节都合法, 但必须**跨重启稳定**:
 * sign-service 拿它派生 device_blob, blob 决定 sign/extra/token 的设备绑定, 换一组
 * 就等于换了台设备, 服务器按新设备处理。这里从持久化的 16B machine guid 派生, 让
 * sign / qimei / login 对外是同一台设备。
 *
 * 派生方式跟 LuckyLillia.Sign/src/Android/watch/poc/src/main.rs 的 device32_from_guid
 * 逐字节一致, **改了就是换设备身份**, 不要动。
 */
export function device32FromGuid(guid: Buffer): Buffer {
  const half = (salt: string) => createHash('md5').update(salt).update(guid).digest()
  return Buffer.concat([half('watchqq-d32-a:'), half('watchqq-d32-b:')])
}
