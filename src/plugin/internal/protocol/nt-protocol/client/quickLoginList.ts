const RETRY_MS = 2000
const MAX_ATTEMPTS = 60

export function isQuickLoginUnsupported(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'status' in error && error.status === 501
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, RETRY_MS)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}

/** QQ's login service can still be starting, or briefly fail, after its process appears. */
export async function readQuickLoginList<T extends { ready?: boolean }>(
  request: () => Promise<T>,
  signal: AbortSignal,
  onWaiting: (waitingForLoginService: boolean) => void,
): Promise<T | undefined> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !signal.aborted; attempt++) {
    try {
      const data = await request()
      if (signal.aborted) return
      if (data.ready !== false) return data
      lastError = undefined
      onWaiting(true)
    } catch (error) {
      if (signal.aborted) return
      if (isQuickLoginUnsupported(error)) throw error
      lastError = error
      onWaiting(false)
    }
    if (attempt + 1 < MAX_ATTEMPTS) await waitForRetry(signal)
  }
  if (signal.aborted) return
  throw new Error(lastError instanceof Error
    ? `读取快速登录账号失败：${lastError.message}`
    : 'QQ 的登录服务暂未就绪，请重试或扫码登录')
}
