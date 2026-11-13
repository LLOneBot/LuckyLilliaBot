import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForWebQQAccount, type WebQQAccount } from '@/plugin/internal/tool/webqq/client/account'

const online: WebQQAccount = { online: true, uin: '10001', uid: 'u_10001', nick: '测试账号' }

describe('WebQQ waits for the current login', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('recovers from an initial offline response without reopening the page', async () => {
    const request = vi.fn().mockResolvedValueOnce({ ...online, online: false }).mockResolvedValue(online)
    const notice = vi.fn()
    const result = waitForWebQQAccount(request, new AbortController().signal, notice)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(result).resolves.toEqual(online)
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ error: false }))
    expect(request).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries route startup and connection failures until the account is online', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('route not ready'))
      .mockRejectedValueOnce(new Error('network disconnected')).mockResolvedValue(online)
    const notice = vi.fn()
    const result = waitForWebQQAccount(request, new AbortController().signal, notice)
    await vi.advanceTimersByTimeAsync(4000)
    await expect(result).resolves.toEqual(online)
    expect(notice.mock.calls.map(([value]) => value)).toEqual([
      { message: 'route not ready', error: true }, { message: 'network disconnected', error: true },
    ])
  })

  it.each(['uin', 'uid'] as const)('does not initialize account caches before %s arrives', async field => {
    const request = vi.fn().mockResolvedValueOnce({ ...online, [field]: '' }).mockResolvedValue(online)
    const result = waitForWebQQAccount(request, new AbortController().signal, vi.fn())
    await vi.advanceTimersByTimeAsync(2000)
    await expect(result).resolves.toEqual(online)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('cancels the retry timer when the page closes or the account changes', async () => {
    const controller = new AbortController()
    const request = vi.fn().mockResolvedValue({ ...online, online: false })
    const result = waitForWebQQAccount(request, controller.signal, vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await expect(result).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(10000)
    expect(request).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards an old account response after cancellation', async () => {
    const response = Promise.withResolvers<WebQQAccount>()
    const controller = new AbortController()
    const notice = vi.fn()
    const request = vi.fn(() => response.promise)
    const initialize = vi.fn()
    const result = waitForWebQQAccount(request, controller.signal, notice, initialize)
    expect(request).toHaveBeenCalledWith(controller.signal)
    controller.abort()
    response.resolve(online)
    await expect(result).resolves.toBeUndefined()
    expect(notice).not.toHaveBeenCalled()
    expect(initialize).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not overlap requests or poll after a successful login', async () => {
    const response = Promise.withResolvers<WebQQAccount>()
    const request = vi.fn(() => response.promise)
    const result = waitForWebQQAccount(request, new AbortController().signal, vi.fn())
    await vi.advanceTimersByTimeAsync(10000)
    expect(request).toHaveBeenCalledOnce()
    response.resolve(online)
    await expect(result).resolves.toEqual(online)
    await vi.advanceTimersByTimeAsync(10000)
    expect(request).toHaveBeenCalledOnce()
  })
})
