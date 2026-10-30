import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MacosEstablishArgs, MacosTokenResult } from '@/native/sign-types'

// 按协议分流取 sign-token 的路由。重点守三件事:
//   1. 只有 linux 走本地 getLinuxSAToken; watch / windows 必须留在经 manager 的老路 ——
//      本地 ESK 是真往 QQ 发包, 并进来 watch 就会从手表连接上发一个 Linux 形状的 ESK。
//   2. macOS 通道密钥留在 native, Bot 只选择 ESK / login-token 路由并缓存 token 与有效期。
//   3. native 解不出 TTL 时返 0, 不能原样用 (等于立刻过期 -> 每 30s 打一次 ESK)。

const h = vi.hoisted(() => ({
  protocol: 'linux' as string,
  proxy: {} as Record<string, unknown>,
}))

vi.mock('@/common/utils/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/utils/environment')>()),
  getProtocol: () => h.protocol,
}))
// sign.ts 里 watch 的 device32 那段还读 profile.family, 跟 protocol 保持一致。
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/profiles', () => ({
  getActiveProfile: () => ({ family: h.protocol === 'watch' ? 'watch' : 'nt' }),
}))
vi.mock('@/native', () => ({
  getNativeAddon: () => h.proxy,
}))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/macosDevice', () => ({
  getMacosDevice: async () => ({ qimei36: 'q36', devicePbHex: 'aa' }),
}))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

import { setupSign, acquireSignToken, acquireMacosEskOnly } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign'

const DAY = 24 * 60 * 60

function makeProxy(overrides: Record<string, unknown> = {}) {
  return {
    init: vi.fn(async () => {}),
    // 经 manager 的老路: token 是 Buffer, 老代码无视它的 TTL 固定给 24h。
    acquireSignToken: vi.fn(async () => ({ token: Buffer.from('MANAGER_TOK1'), ttlSecs: 0 })),
    getLinuxSAToken: vi.fn(async () => ({ token: 'LOCAL_TOKEN1', ttlSecs: 3600 })),
    getMacosEskToken: vi.fn(async (_args: MacosEstablishArgs): Promise<MacosTokenResult> => ({ token: 'ESK_TOKEN_01', ttlSecs: 0 })),
    getMacosLoginToken: vi.fn(async (_args: MacosEstablishArgs): Promise<MacosTokenResult> => ({ token: 'LOGIN_TOKEN1', ttlSecs: 7200 })),
    ...overrides,
  }
}

async function useProxy(proxy: Record<string, unknown>) {
  h.proxy = proxy
  await setupSign({
    botVersion: 'test',
    authToken: 'jwt',
    machineGuid: Buffer.alloc(16, 0x22),
    sendPacket: async () => Buffer.alloc(0),
  })
}

describe('acquireSignToken 按协议分流', () => {
  beforeEach(() => {
    h.protocol = 'linux'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('linux 走本地 ESK, 不打 manager, 用服务器下发的 TTL', async () => {
    const proxy = makeProxy()
    await useProxy(proxy)

    const r = await acquireSignToken(10001, 'V1_LNX_NQ_3.2.28_48517_GW_B')

    expect(r).toEqual({ token: 'LOCAL_TOKEN1', ttlSecs: 3600 })
    expect(proxy.getLinuxSAToken).toHaveBeenCalledWith({ qua: 'V1_LNX_NQ_3.2.28_48517_GW_B' })
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()
  })

  it('linux 解不出 TTL (0) 时回落 24h, 而不是立刻过期', async () => {
    const proxy = makeProxy({
      getLinuxSAToken: vi.fn(async () => ({ token: 'LOCAL_TOKEN1', ttlSecs: 0 })),
    })
    await useProxy(proxy)

    const r = await acquireSignToken(10001, 'V1_LNX_NQ_3.2.28_48517_GW_B')

    expect(r.ttlSecs).toBe(DAY)
  })

  it('linux 遇到没有 getLinuxSAToken 的老 .node, 退回经 manager 取', async () => {
    const proxy = makeProxy({ getLinuxSAToken: undefined })
    await useProxy(proxy)

    const r = await acquireSignToken(10001, 'V1_LNX_NQ_3.2.28_48517_GW_B')

    expect(r).toEqual({ token: 'MANAGER_TOK1', ttlSecs: DAY })
    expect(proxy.acquireSignToken).toHaveBeenCalledWith({ uin: 10001, qua: 'V1_LNX_NQ_3.2.28_48517_GW_B' })
  })

  it.each(['watch', 'windows'])('%s 不走本地 ESK, 留在经 manager 的老路', async (name) => {
    h.protocol = name
    const proxy = makeProxy()
    await useProxy(proxy)

    await acquireSignToken(10001, 'V1_XXX')

    expect(proxy.getLinuxSAToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).toHaveBeenCalledTimes(1)
  })

  it('macos 无缓存时先建 ESK, 再由 native 完成登录 token 流程', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy()
    await useProxy(proxy)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const r = await acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B')

    expect(r).toEqual({ token: 'LOGIN_TOKEN1', ttlSecs: 7200 })
    expect(proxy.getLinuxSAToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()

    expect(proxy.getMacosEskToken).toHaveBeenCalledExactlyOnceWith({ devicePbHex: 'aa', tsMs: 1_000_000 })
    expect(proxy.getMacosLoginToken).toHaveBeenCalledExactlyOnceWith({ devicePbHex: 'aa', tsMs: 1_000_000 })
    expect(proxy.getMacosEskToken.mock.invocationCallOrder[0]).toBeLessThan(proxy.getMacosLoginToken.mock.invocationCallOrder[0])
  })

  it('macos 带着 ESK 状态只取登录 token, 不重建 ESK 或向 native 传回通道密钥', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy()
    await useProxy(proxy)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const esk = { token: 'ESK_TOKEN_09', ttlSecs: 3600, expiresAt: Date.now() + 3_600_000 }

    const r = await acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B', esk)

    expect(r).toEqual({ token: 'LOGIN_TOKEN1', ttlSecs: 7200 })
    expect(proxy.getMacosEskToken).not.toHaveBeenCalled()
    expect(proxy.getMacosLoginToken).toHaveBeenCalledExactlyOnceWith({ devicePbHex: 'aa', tsMs: 1_000_000 })
    expect(proxy.getLinuxSAToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()
  })

  it('macos ESK 解不出 TTL (0) 时回落 24h, 过期时间按它算', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy()
    await useProxy(proxy)
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const esk = await acquireMacosEskOnly('V1_MAC_NQ_7.0.0_52194_GW_B')

    expect(esk).toEqual({ token: 'ESK_TOKEN_01', ttlSecs: DAY, expiresAt: 1_000_000 + DAY * 1000 })
    expect(proxy.getMacosEskToken).toHaveBeenCalledExactlyOnceWith({ devicePbHex: 'aa', tsMs: 1_000_000 })
    expect(proxy.getMacosLoginToken).not.toHaveBeenCalled()
  })

  it.each([false, true])('macos 登录 token 为空时保留 ESK token 和 TTL (已有缓存=%s)', async (cached) => {
    h.protocol = 'macos'
    const proxy = makeProxy({
      getMacosEskToken: vi.fn(async () => ({ token: 'ESK_TOKEN_09', ttlSecs: 3600 })),
      getMacosLoginToken: vi.fn(async () => ({ token: '', ttlSecs: 0 })),
    })
    await useProxy(proxy)
    const esk = cached ? { token: 'ESK_TOKEN_09', ttlSecs: 3600, expiresAt: Date.now() + 3_600_000 } : undefined

    await expect(acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B', esk)).resolves.toEqual({ token: 'ESK_TOKEN_09', ttlSecs: 3600 })

    expect(proxy.getMacosEskToken).toHaveBeenCalledTimes(cached ? 0 : 1)
    expect(proxy.getMacosLoginToken).toHaveBeenCalledTimes(1)
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()
  })

  it('macos 明确拒绝缺少新登录 token 接口的 native 包', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy({ getMacosLoginToken: undefined })
    await useProxy(proxy)

    await expect(acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B')).rejects.toThrow('缺 macOS o3 token 方法')

    expect(proxy.getMacosEskToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()
  })
})
