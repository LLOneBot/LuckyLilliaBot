import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readQuickLoginList } from '@/plugin/internal/protocol/nt-protocol/client/quickLoginList'

describe('loading QQ saved accounts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('recovers after an API failure and QQ still starting', async () => {
    const accounts = { ready: true, LocalLoginInfoList: [{ uin: '123456' }] }
    const request = vi.fn()
      .mockRejectedValueOnce(new Error('QQ login service disconnected'))
      .mockResolvedValueOnce({ ready: false, LocalLoginInfoList: [] })
      .mockResolvedValueOnce(accounts)
    const waiting = vi.fn()
    const result = readQuickLoginList(request, new AbortController().signal, waiting)

    await vi.advanceTimersByTimeAsync(4000)

    await expect(result).resolves.toEqual(accounts)
    expect(request).toHaveBeenCalledTimes(3)
    expect(waiting.mock.calls).toEqual([[false], [true]])
  })

  it('accepts a definitive empty list without retrying', async () => {
    const request = vi.fn().mockResolvedValue({ ready: true, LocalLoginInfoList: [] })
    await expect(readQuickLoginList(request, new AbortController().signal, vi.fn()))
      .resolves.toEqual({ ready: true, LocalLoginInfoList: [] })
    expect(request).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves an unsupported capability error immediately instead of inventing an empty list', async () => {
    const error = Object.assign(new Error('当前桥接组件不支持读取账号列表，请更新 LLBot'), { status: 501 })
    const request = vi.fn().mockRejectedValue(error)
    await expect(readQuickLoginList(request, new AbortController().signal, vi.fn())).rejects.toBe(error)
    expect(request).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops retrying and clears its timer when the page unmounts', async () => {
    const controller = new AbortController()
    const request = vi.fn().mockResolvedValue({ ready: false })
    const result = readQuickLoginList(request, controller.signal, vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await expect(result).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(10000)
    expect(request).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores a list response from a page that already unmounted', async () => {
    const controller = new AbortController()
    let respond!: (data: { ready: boolean }) => void
    const request = vi.fn(() => new Promise<{ ready: boolean }>(resolve => { respond = resolve }))
    const waiting = vi.fn()
    const result = readQuickLoginList(request, controller.signal, waiting)
    controller.abort()
    respond({ ready: true })
    await expect(result).resolves.toBeUndefined()
    expect(waiting).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes a failed startup with its cause so the page can offer a retry', async () => {
    const request = vi.fn().mockRejectedValue(new Error('QQ login service disconnected'))
    const result = readQuickLoginList(request, new AbortController().signal, vi.fn())
    const rejected = expect(result).rejects.toThrow('读取快速登录账号失败：QQ login service disconnected')
    await vi.advanceTimersByTimeAsync(120000)
    await rejected
    expect(vi.getTimerCount()).toBe(0)
  })
})
