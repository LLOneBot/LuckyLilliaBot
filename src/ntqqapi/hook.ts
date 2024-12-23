import { log } from '@/common/utils'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
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
}

const logHook = false

const receiveHooks: Map<string, {
  method: ReceiveCmdS[]
  hookFunc: (payload: any) => void | Promise<void>
}> = new Map()

/*const callHooks: Array<{
  method: NTMethod[]
  hookFunc: (callParams: unknown[]) => void | Promise<void>
}> = []*/

export function startHook() {
  log('start hook')

  const senderExclude = Symbol()

  ipcMain.emit = new Proxy(ipcMain.emit, {
    apply(target, thisArg, args: [channel: string, ...args: any]) {
      if (args[2]?.eventName?.startsWith('ns-LoggerApi')) {
        return target.apply(thisArg, args)
      }
      if (logHook) {
        log('request', args)
      }
      const event = args[1]
      if (event.sender && !event.sender[senderExclude]) {
        event.sender[senderExclude] = true
        event.sender.send = new Proxy(event.sender.send, {
          apply(target, thisArg, args: [channel: string, meta: Dict, data: Dict[]]) {
            if (args[1]?.eventName?.startsWith('ns-LoggerApi')) {
              return target.apply(thisArg, args)
            }
            if (logHook) {
              log('received', args)
            }

            const callbackId = args[1]?.callbackId
            if (callbackId) {
              if (hookApiCallbacks[callbackId]) {
                Promise.resolve(hookApiCallbacks[callbackId](args[2]))
                delete hookApiCallbacks[callbackId]
              }
            } else if (args[2]) {
              if (['IPC_DOWN_2', 'IPC_DOWN_3'].includes(args[0])) {
                for (const receiveData of args[2]) {
                  for (const hook of receiveHooks.values()) {
                    if (hook.method.includes(receiveData.cmdName)) {
                      Promise.resolve(hook.hookFunc(receiveData.payload))
                    }
                  }
                }
              }
            }
            return target.apply(thisArg, args)
          }
        })
      }

      /*if (args[3]?.length) {
        const method = args[3][0]
        const callParams = args[3].slice(1)
        for (const hook of callHooks) {
          if (hook.method.includes(method)) {
            Promise.resolve(hook.hookFunc(callParams))
          }
        }
      }*/
      return target.apply(thisArg, args)
    },
  })
}

export function registerReceiveHook<PayloadType>(
  method: string | string[],
  hookFunc: (payload: PayloadType) => void,
): string {
  const id = randomUUID()
  if (!Array.isArray(method)) {
    method = [method]
  }
  receiveHooks.set(id, {
    method: method as ReceiveCmdS[],
    hookFunc,
  })
  return id
}

/*export function registerCallHook(
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
}*/

export function removeReceiveHook(id: string) {
  receiveHooks.delete(id)
}
