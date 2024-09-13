import type { BrowserWindow } from 'electron'
import { NTClass, NTMethod } from './ntcall'
import { log } from '@/common/utils'
import { randomUUID } from 'node:crypto'
import { Dict } from 'cosmokit'

export const hookApiCallbacks: Record<string, (res: any) => void> = {}

export enum ReceiveCmdS {
  RECENT_CONTACT = 'nodeIKernelRecentContactListener/onRecentContactListChangedVer2',
  UPDATE_MSG = 'nodeIKernelMsgListener/onMsgInfoListUpdate',
  UPDATE_ACTIVE_MSG = 'nodeIKernelMsgListener/onActiveMsgInfoUpdate',
  NEW_MSG = 'nodeIKernelMsgListener/onRecvMsg',
  NEW_ACTIVE_MSG = 'nodeIKernelMsgListener/onRecvActiveMsg',
  SELF_SEND_MSG = 'nodeIKernelMsgListener/onAddSendMsg',
  USER_INFO = 'nodeIKernelProfileListener/onProfileSimpleChanged',
  USER_DETAIL_INFO = 'nodeIKernelProfileListener/onProfileDetailInfoChanged',
  GROUPS = 'nodeIKernelGroupListener/onGroupListUpdate',
  GROUPS_STORE = 'onGroupListUpdate',
  GROUP_MEMBER_INFO_UPDATE = 'nodeIKernelGroupListener/onMemberInfoChange',
  FRIENDS = 'onBuddyListChange',
  MEDIA_DOWNLOAD_COMPLETE = 'nodeIKernelMsgListener/onRichMediaDownloadComplete',
  UNREAD_GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupNotifiesUnreadCountUpdated',
  GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupSingleScreenNotifies',
  FRIEND_REQUEST = 'nodeIKernelBuddyListener/onBuddyReqChange',
  SELF_STATUS = 'nodeIKernelProfileListener/onSelfStatusChanged',
  CACHE_SCAN_FINISH = 'nodeIKernelStorageCleanListener/onFinishScan',
  MEDIA_UPLOAD_COMPLETE = 'nodeIKernelMsgListener/onRichMediaUploadComplete',
  SKEY_UPDATE = 'onSkeyUpdate',
}

type NTReturnData = [
  {
    type: 'request'
    eventName: NTClass
    callbackId?: string
  },
  {
    cmdName: ReceiveCmdS
    cmdType: 'event'
    payload: unknown
  }[]
]

const logHook = false

const receiveHooks: Array<{
  method: ReceiveCmdS[]
  hookFunc: (payload: any) => void | Promise<void>
  id: string
}> = []

const callHooks: Array<{
  method: NTMethod[]
  hookFunc: (callParams: unknown[]) => void | Promise<void>
}> = []

export function hookNTQQApiReceive(window: BrowserWindow, onlyLog: boolean) {
  window.webContents.send = new Proxy(window.webContents.send, {
    apply(target, thisArg, args: [channel: string, ...args: NTReturnData]) {
      try {
        if (logHook && !args[1]?.eventName?.startsWith('ns-LoggerApi')) {
          log('received ntqq api message', args)
        }
      } catch { }
      if (!onlyLog) {
        if (args[2] instanceof Array) {
          for (const receiveData of args[2]) {
            const ntMethodName = receiveData.cmdName
            for (const hook of receiveHooks) {
              if (hook.method.includes(ntMethodName)) {
                Promise.resolve(hook.hookFunc(receiveData.payload))
              }
            }
          }
        }
        if (args[1]?.callbackId) {
          const callbackId = args[1].callbackId
          if (hookApiCallbacks[callbackId]) {
            Promise.resolve(hookApiCallbacks[callbackId](args[2]))
            delete hookApiCallbacks[callbackId]
          }
        }
      }
      return target.apply(thisArg, args)
    },
  })
}

export function hookNTQQApiCall(window: BrowserWindow, onlyLog: boolean) {
  const webContents = window.webContents as Dict
  const ipc_message_proxy = webContents._events['-ipc-message']?.[0] || webContents._events['-ipc-message']

  const proxyIpcMsg = new Proxy(ipc_message_proxy, {
    apply(target, thisArg, args) {
      const isLogger = args[3]?.[0]?.eventName?.startsWith('ns-LoggerApi')
      if (!isLogger) {
        try {
          logHook && log('call NTQQ api', thisArg, args)
        } catch (e) { }
        if (!onlyLog) {
          try {
            const _args: unknown[] = args[3][1]
            const cmdName = _args[0] as NTMethod
            const callParams = _args.slice(1)
            callHooks.forEach((hook) => {
              if (hook.method.includes(cmdName)) {
                Promise.resolve(hook.hookFunc(callParams))
              }
            })
          } catch { }
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

  /*const ipc_invoke_proxy = webContents._events['-ipc-invoke']?.[0] || webContents._events['-ipc-invoke']
  const proxyIpcInvoke = new Proxy(ipc_invoke_proxy, {
    apply(target, thisArg, args) {
      //HOOK_LOG && log('call NTQQ invoke api', thisArg, args)
      args[0]['_replyChannel']['sendReply'] = new Proxy(args[0]['_replyChannel']['sendReply'], {
        apply(sendtarget, sendthisArg, sendargs) {
          sendtarget.apply(sendthisArg, sendargs)
        },
      })
      const ret = target.apply(thisArg, args)
      //HOOK_LOG && log('call NTQQ invoke api return', ret)
      return ret
    },
  })
  if (webContents._events['-ipc-invoke']?.[0]) {
    webContents._events['-ipc-invoke'][0] = proxyIpcInvoke
  } else {
    webContents._events['-ipc-invoke'] = proxyIpcInvoke
  }*/
}

export function registerReceiveHook<PayloadType>(
  method: string | string[],
  hookFunc: (payload: PayloadType) => void,
): string {
  const id = randomUUID()
  if (!Array.isArray(method)) {
    method = [method]
  }
  receiveHooks.push({
    method: method as ReceiveCmdS[],
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
