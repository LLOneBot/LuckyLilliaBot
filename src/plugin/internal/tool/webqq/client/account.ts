export interface WebQQAccount {
  online: boolean
  uid: string
  uin: string
  nick: string
}

export interface AccountNotice {
  message: string
  error: boolean
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, 2000)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}

/** The route may mount before login settles, or briefly fail during reconnect. */
export async function waitForWebQQAccount(
  request: (signal: AbortSignal) => Promise<WebQQAccount>,
  signal: AbortSignal,
  onUnavailable: (notice: AccountNotice) => void,
  initialize?: (account: WebQQAccount) => void,
): Promise<WebQQAccount | undefined> {
  while (!signal.aborted) {
    try {
      const account = await request(signal)
      if (signal.aborted) return
      if (account.online && account.uin && account.uid) {
        initialize?.(account)
        return account
      }
      onUnavailable({ message: 'NTQQ 账号还没有登录，登录后会自动进入聊天', error: false })
    } catch (error) {
      if (signal.aborted) return
      onUnavailable({ message: error instanceof Error ? error.message : '获取登录信息失败', error: true })
    }
    await waitForRetry(signal)
  }
}
