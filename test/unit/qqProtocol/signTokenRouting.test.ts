import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 按协议分流取 sign-token 的路由。重点守两件事:
//   1. 只有 linux 走本地 getLinuxEskToken; watch / windows 必须留在经 manager 的老路 ——
//      本地 ESK 是真往 QQ 发包, 并进来 watch 就会从手表连接上发一个 Linux 形状的 ESK。
//   2. native 解不出 TTL 时返 0, 不能原样用 (等于立刻过期 -> 每 30s 打一次 ESK)。

const h = vi.hoisted(() => ({
  protocol: 'linux' as string,
  proxy: {} as Record<string, unknown>,
}))

vi.mock('@/common/utils/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/utils/environment')>()),
  getProtocol: () => h.protocol,
}))
// sign.ts 里 watch 的 device32 那段还读 profile.family, 跟 protocol 保持一致。
vi.mock('@/main/qqProtocol/direct-lib/profiles', () => ({
  getActiveProfile: () => ({ family: h.protocol === 'watch' ? 'watch' : 'nt' }),
}))
vi.mock('@/main/qqProtocol/direct-lib/sign-proxy', () => ({
  getSignProxy: () => h.proxy,
}))
vi.mock('@/main/qqProtocol/direct-lib/macosDevice', () => ({
  getMacosDevice: async () => ({ qimei36: 'q36', devicePbHex: 'aa' }),
}))
vi.mock('@/main/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

import { setupSign, acquireSignToken, acquireMacosEskOnly } from '@/main/qqProtocol/direct-lib/sign'

const DAY = 24 * 60 * 60

function makeProxy(overrides: Record<string, unknown> = {}) {
  return {
    init: vi.fn(async () => {}),
    // 经 manager 的老路: token 是 Buffer, 老代码无视它的 TTL 固定给 24h。
    acquireSignToken: vi.fn(async () => ({ token: Buffer.from('MANAGER_TOK1'), ttlSecs: 0 })),
    getLinuxEskToken: vi.fn(async () => ({ token: 'LOCAL_TOKEN1', ttlSecs: 3600 })),
    getMacosEskToken: vi.fn(async () => ({ token: 'ESK_TOKEN_01', ttlSecs: 0, aesKey: 'k1', shareId: 's1' })),
    getMacosA2EstablishToken: vi.fn(async () => ({ token: '', ttlSecs: 0, aesKey: 'k2', shareId: 's2' })),
    getMacosSa2Token: vi.fn(async () => ({ token: 'SA2_TOKEN_01', ttlSecs: 7200, aesKey: 'k1', shareId: 's1' })),
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
    expect(proxy.getLinuxEskToken).toHaveBeenCalledWith({ qua: 'V1_LNX_NQ_3.2.28_48517_GW_B' })
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()
  })

  it('linux 解不出 TTL (0) 时回落 24h, 而不是立刻过期', async () => {
    const proxy = makeProxy({
      getLinuxEskToken: vi.fn(async () => ({ token: 'LOCAL_TOKEN1', ttlSecs: 0 })),
    })
    await useProxy(proxy)

    const r = await acquireSignToken(10001, 'V1_LNX_NQ_3.2.28_48517_GW_B')

    expect(r.ttlSecs).toBe(DAY)
  })

  it('linux 遇到没有 getLinuxEskToken 的老 .node, 退回经 manager 取', async () => {
    const proxy = makeProxy({ getLinuxEskToken: undefined })
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

    expect(proxy.getLinuxEskToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).toHaveBeenCalledTimes(1)
  })

  it('macos 走 o3 三步, A2 没建成就回退 ESK 通道, SA2 跟 A2 用同一个 tsMs', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy()
    await useProxy(proxy)

    const r = await acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B')

    expect(r).toEqual({ token: 'SA2_TOKEN_01', ttlSecs: 7200 })
    expect(proxy.getLinuxEskToken).not.toHaveBeenCalled()
    expect(proxy.acquireSignToken).not.toHaveBeenCalled()

    const a2Args = (proxy.getMacosA2EstablishToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const sa2Args = (proxy.getMacosSa2Token as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // A2 返空 token = 通道没建成, SA2 应该用 ESK 那套 aesKey/shareId。
    expect(sa2Args.aesKey).toBe('k1')
    expect(sa2Args.shareId).toBe('s1')
    expect(sa2Args.currentToken).toBe('ESK_TOKEN_01')
    expect(sa2Args.tsMs).toBe(a2Args.tsMs)
  })

  it('macos 带着 ESK 状态只跑 A2+SA2, 不再重跑 ESK', async () => {
    h.protocol = 'macos'
    const proxy = makeProxy()
    await useProxy(proxy)
    const esk = { token: 'ESK_TOKEN_09', aesKey: 'k9', shareId: 's9', devicePbHex: 'bb', ttlSecs: 3600, expiresAt: Date.now() + 3_600_000 }

    const r = await acquireSignToken(10001, 'V1_MAC_NQ_7.0.0_52194_GW_B', esk)

    expect(r).toEqual({ token: 'SA2_TOKEN_01', ttlSecs: 7200 })
    expect(proxy.getMacosEskToken).not.toHaveBeenCalled()
    const a2Args = (proxy.getMacosA2EstablishToken as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const sa2Args = (proxy.getMacosSa2Token as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(a2Args.devicePbHex).toBe('bb')
    // A2 came back empty, so SA2 stays on the ESK channel and presents ESK's token1.
    expect(sa2Args).toMatchObject({ devicePbHex: 'bb', aesKey: 'k9', shareId: 's9', currentToken: 'ESK_TOKEN_09', tsMs: a2Args.tsMs })
  })

  it('macos ESK 解不出 TTL (0) 时回落 24h, 过期时间按它算', async () => {
    h.protocol = 'macos'
    await useProxy(makeProxy())
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000)

    const esk = await acquireMacosEskOnly('V1_MAC_NQ_7.0.0_52194_GW_B')

    expect(esk).toMatchObject({ token: 'ESK_TOKEN_01', aesKey: 'k1', shareId: 's1', devicePbHex: 'aa', ttlSecs: DAY })
    expect(esk.expiresAt).toBe(1_000_000 + DAY * 1000)
  })
})
