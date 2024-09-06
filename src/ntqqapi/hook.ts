import type { BrowserWindow } from 'electron'
import { NTClass, NTMethod } from './ntcall'
import { log } from '@/common/utils'
import { randomUUID } from 'node:crypto'
import { Dict } from 'cosmokit'

export const hookApiCallbacks: Record<string, (res: any) => void> = {}

export const ReceiveCmdS = {
  RECENT_CONTACT: 'nodeIKernelRecentContactListener/onRecentContactListChangedVer2',
  UPDATE_MSG: 'nodeIKernelMsgListener/onMsgInfoListUpdate',
  UPDATE_ACTIVE_MSG: 'nodeIKernelMsgListener/onActiveMsgInfoUpdate',
  NEW_MSG: `nodeIKernelMsgListener/onRecvMsg`,
  NEW_ACTIVE_MSG: `nodeIKernelMsgListener/onRecvActiveMsg`,
  SELF_SEND_MSG: 'nodeIKernelMsgListener/onAddSendMsg',
  USER_INFO: 'nodeIKernelProfileListener/onProfileSimpleChanged',
  USER_DETAIL_INFO: 'nodeIKernelProfileListener/onProfileDetailInfoChanged',
  GROUPS: 'nodeIKernelGroupListener/onGroupListUpdate',
  GROUPS_STORE: 'onGroupListUpdate',
  GROUP_MEMBER_INFO_UPDATE: 'nodeIKernelGroupListener/onMemberInfoChange',
  FRIENDS: 'onBuddyListChange',
  MEDIA_DOWNLOAD_COMPLETE: 'nodeIKernelMsgListener/onRichMediaDownloadComplete',
  UNREAD_GROUP_NOTIFY: 'nodeIKernelGroupListener/onGroupNotifiesUnreadCountUpdated',
  GROUP_NOTIFY: 'nodeIKernelGroupListener/onGroupSingleScreenNotifies',
  FRIEND_REQUEST: 'nodeIKernelBuddyListener/onBuddyReqChange',
  SELF_STATUS: 'nodeIKernelProfileListener/onSelfStatusChanged',
  CACHE_SCAN_FINISH: 'nodeIKernelStorageCleanListener/onFinishScan',
  MEDIA_UPLOAD_COMPLETE: 'nodeIKernelMsgListener/onRichMediaUploadComplete',
  SKEY_UPDATE: 'onSkeyUpdate',
} as const

export type ReceiveCmd = string

interface NTQQApiReturnData extends Array<unknown> {
  0: {
    type: 'request'
    eventName: NTClass
    callbackId?: string
  }
  1: {
    cmdName: ReceiveCmd
    cmdType: 'event'
    payload: unknown
  }[]
}

const logHook = false

const receiveHooks: Array<{
  method: ReceiveCmd[]
  hookFunc: (payload: any) => void | Promise<void>
  id: string
}> = []

const callHooks: Array<{
  method: NTMethod[]
  hookFunc: (callParams: unknown[]) => void | Promise<void>
}> = []

export function hookNTQQApiReceive(window: BrowserWindow, onlyLog: boolean) {
  const originalSend = window.webContents.send
  const patchSend = (channel: string, ...args: NTQQApiReturnData) => {
    try {
      const isLogger = args[0]?.eventName?.startsWith('ns-LoggerApi')
      if (logHook && !isLogger) {
        log(`received ntqq api message: ${channel}`, args)
      }
    } catch { }
    if (!onlyLog) {
      if (args?.[1] instanceof Array) {
        for (const receiveData of args[1]) {
          const ntQQApiMethodName = receiveData.cmdName
          // log(`received ntqq api message: ${channel} ${ntQQApiMethodName}`, JSON.stringify(receiveData))
          for (const hook of receiveHooks) {
            if (hook.method.includes(ntQQApiMethodName)) {
              new Promise(resolve => {
                try {
                  hook.hookFunc(receiveData.payload)
                } catch (e) {
                  log('hook error', ntQQApiMethodName, (e as Error).stack?.toString())
                }
                resolve(undefined)
              }).then()
            }
          }
        }
      }
      if (args[0]?.callbackId) {
        // log("hookApiCallback", hookApiCallbacks, args)
        const callbackId = args[0].callbackId
        if (hookApiCallbacks[callbackId]) {
          new Promise(resolve => {
            hookApiCallbacks[callbackId](args[1])
            resolve(undefined)
          }).then()
          delete hookApiCallbacks[callbackId]
        }
      }
    }
    originalSend.call(window.webContents, channel, ...args)
  }
  window.webContents.send = patchSend
}

export function hookNTQQApiCall(window: BrowserWindow, onlyLog: boolean) {
  // 监听调用NTQQApi
  const webContents = window.webContents as Dict
  const ipc_message_proxy = webContents._events['-ipc-message']?.[0] || webContents._events['-ipc-message']

  const proxyIpcMsg = new Proxy(ipc_message_proxy, {
    apply(target, thisArg, args) {
      // console.log(thisArg, args);
      let isLogger = false
      try {
        isLogger = args[3][0].eventName.startsWith('ns-LoggerApi')
      } catch (e) { }
      if (!isLogger) {
        try {
          logHook && log('call NTQQ api', thisArg, args)
        } catch (e) { }
        if (!onlyLog) {
          try {
            const _args: unknown[] = args[3][1]
            const cmdName: NTMethod = _args[0] as NTMethod
            const callParams = _args.slice(1)
            callHooks.forEach((hook) => {
              if (hook.method.includes(cmdName)) {
                new Promise(resolve => {
                  try {
                    hook.hookFunc(callParams)
                  } catch (e) {
                    log('hook call error', e, _args)
                  }
                  resolve(undefined)
                }).then()
              }
            })
          } catch (e) { }
        }
      }
      return target.apply(thisArg, args)
    },
  })
  if (webContents._events['-ipc-message']?.[0]) {
    webContents._events['-ipc-message'][0] = proxyIpcMsg
  } else {
    webContents._events['-ipc-message'] = proxyIpcMsg
  }

  const ipc_invoke_proxy = webContents._events['-ipc-invoke']?.[0] || webContents._events['-ipc-invoke']
  const proxyIpcInvoke = new Proxy(ipc_invoke_proxy, {
    apply(target, thisArg, args) {
      //HOOK_LOG && log('call NTQQ invoke api', thisArg, args)
      args[0]['_replyChannel']['sendReply'] = new Proxy(args[0]['_replyChannel']['sendReply'], {
        apply(sendtarget, sendthisArg, sendargs) {
          sendtarget.apply(sendthisArg, sendargs)
        },
      })
      const ret = target.apply(thisArg, args)
      /*try {
        HOOK_LOG && log('call NTQQ invoke api return', ret)
      } catch (e) { }*/
      return ret
    },
  })
  if (webContents._events['-ipc-invoke']?.[0]) {
    webContents._events['-ipc-invoke'][0] = proxyIpcInvoke
  } else {
    webContents._events['-ipc-invoke'] = proxyIpcInvoke
  }
}

export function registerReceiveHook<PayloadType>(
  method: ReceiveCmd | ReceiveCmd[],
  hookFunc: (payload: PayloadType) => void,
): string {
  const id = randomUUID()
  if (!Array.isArray(method)) {
    method = [method]
  }
  receiveHooks.push({
    method,
    hookFunc,
    id,
  })
  return id
}

export function registerCallHook(
  method: NTMethod | NTMethod[],
  hookFunc: (callParams: unknown[]) => void | Promise<void>,
): void {
  if (!Array.isArray(method)) {
    method = [method]
  }
  callHooks.push({
    method,
    hookFunc,
  })
}

export function removeReceiveHook(id: string) {
  const index = receiveHooks.findIndex((h) => h.id === id)
  receiveHooks.splice(index, 1)
}