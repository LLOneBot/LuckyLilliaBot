import type { WebUIContext } from '@luckylillia/plugin-sdk/webui'

let current: WebUIContext | undefined

/** Set by apply(): the API helpers and stores run outside components and have no other way to it. */
export function bindContext(ctx: WebUIContext) {
  current = ctx
}

export function webui(): WebUIContext {
  if (!current) throw new Error('the WebQQ client is used before its apply() ran')
  return current
}

export const showToast = (message: string, type?: 'success' | 'error' | 'warning') => webui().toast(message, type)
