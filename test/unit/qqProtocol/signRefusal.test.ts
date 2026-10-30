import { describe, expect, it, vi } from 'vitest'

// sign.ts is one per process: it has no protocol instance to write to, only the client it was set up by

const proxy = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  signRequest: vi.fn(),
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign-proxy', () => ({
  getSignProxy: () => proxy,
}))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/profiles', () => ({
  getActiveProfile: () => ({ family: 'nt' }),
}))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/macosDevice', () => ({
  getMacosDevice: async () => ({ qimei36: 'q36', devicePbHex: 'aa' }),
}))
vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/machineGuid', () => ({
  loadMachineGuidSync: () => Buffer.alloc(16, 0x11),
}))

import { requestSign, setupSign } from '@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign'

describe('the sign server turning the auth token down', () => {
  it('goes to whoever set sign up, with the reason the server gave', async () => {
    const onRefused = vi.fn()
    await setupSign({
      botVersion: 'test',
      authToken: 'jwt',
      machineGuid: Buffer.alloc(16, 0x22),
      sendPacket: async () => Buffer.alloc(0),
      onRefused,
    })

    proxy.signRequest.mockRejectedValueOnce(new Error('http 403: auth_token 可用 QQ 数量已达上限'))
    expect(await requestSign('wtlogin.login', Buffer.alloc(0), 1)).toBeNull()
    expect(onRefused).toHaveBeenCalledExactlyOnceWith('auth_token 可用 QQ 数量已达上限')

    // Anything else is the server or the network, not the token
    proxy.signRequest.mockRejectedValueOnce(new Error('http 502: upstream down'))
    expect(await requestSign('wtlogin.login', Buffer.alloc(0), 2)).toBeNull()
    expect(onRefused).toHaveBeenCalledTimes(1)
  })
})
