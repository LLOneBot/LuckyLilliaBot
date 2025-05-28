import { log } from '@/common/utils'
import { randomUUID } from 'node:crypto'
import { Awaitable, Dict } from 'cosmokit'
import { NTMethod } from './ntcall'
import { pmhq } from '@/ntqqapi/native/pmhq'

export const hookApiCallbacks: Map<string, (res: any) => void> = new Map()

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
  hookFunc: (payload: any) => Awaitable<void>
}> = new Map()

const callHooks: Map<
  NTMethod,
  (callParams: unknown[]) => Awaitable<void>
> = new Map()

const NT_RECV_PMHQ_TYPE_TO_NT_METHOD = {
  'on_message': 'nodeIKernelMsgListener',
  'on_group': 'nodeIKernelGroupListener',
  'on_buddy': 'nodeIKernelBuddyListener',
}

export function startHook() {

  pmhq.addResListener((data) => {
    let listenerName = data.type
    if ('sub_type' in data.data && listenerName in NT_RECV_PMHQ_TYPE_TO_NT_METHOD) {
      const sub_type = data.data.sub_type
      const ntCmd: ReceiveCmdS = (NT_RECV_PMHQ_TYPE_TO_NT_METHOD[listenerName as keyof typeof NT_RECV_PMHQ_TYPE_TO_NT_METHOD] + '/' + sub_type) as ReceiveCmdS
      for (const hook of receiveHooks.values()) {
        if (hook.method.includes(ntCmd)) {
          Promise.resolve(hook.hookFunc(data.data.data))
        }
      }
    }

  })
  // const senderExclude = Symbol()

  // ipcMain.emit = new Proxy(ipcMain.emit, {
  //   apply(target, thisArg, args: [channel: string, ...args: any]) {
  //     if (args[2]?.eventName?.startsWith('ns-LoggerApi') || args[2]?.eventName === 'LogApi') {
  //       return target.apply(thisArg, args)
  //     }
  //     if (logHook) {
  //       log('【request】', args)
  //     }
  //     const event = args[1]
  //     if (event.sender && !event.sender[senderExclude]) {
  //       event.sender[senderExclude] = true
  //       event.sender.send = new Proxy(event.sender.send, {
  //         apply(target, thisArg, args: [channel: string, meta: Dict, data: Dict[]]) {
  //           if (args[1]?.eventName?.startsWith('ns-LoggerApi') || args[1]?.eventName === 'LogApi') {
  //             return target.apply(thisArg, args)
  //           }
  //           if (logHook) {
  //             log('【received】', args)
  //           }
  //
  //           const callbackId = args[1]?.callbackId
  //           if (callbackId) {
  //             if (hookApiCallbacks.has(callbackId)) {
  //               Promise.resolve(hookApiCallbacks.get(callbackId)!(args[2]))
  //               hookApiCallbacks.delete(callbackId)
  //             }
  //           } else if (args[2]) {
  //             if (['IPC_DOWN_2', 'IPC_DOWN_3', 'RM_IPCFROM_MAIN3', 'RM_IPCFROM_MAIN2'].includes(args[0])) {
  //               let receiveCMDData = args[2];
  //               if (!Array.isArray(args[2])) {
  //                 receiveCMDData = [args[2]]
  //               }
  //               for (const receiveData of receiveCMDData) {
  //                 for (const hook of receiveHooks.values()) {
  //                   if (hook.method.includes(receiveData.cmdName)) {
  //                     Promise.resolve(hook.hookFunc(receiveData.payload))
  //                   }
  //                 }
  //               }
  //             }
  //           }
  //           return target.apply(thisArg, args)
  //         }
  //       })
  //     }
  //
  //     if (args[3]?.length) {
  //       const method = args[3][0]
  //       if (callHooks.has(method)) {
  //         const params = args[3].slice(1)
  //         Promise.resolve(callHooks.get(method)!(params))
  //       }
  //     }
  //     return target.apply(thisArg, args)
  //   },
  // })
}


export function registerReceiveHook<PayloadType>(
  method: string | string[],
  hookFunc: (payload: PayloadType) => Awaitable<void>,
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


export function registerCallHook(
  method: NTMethod,
  hookFunc: (callParams: unknown[]) => Awaitable<void>,
): void {
  callHooks.set(method, hookFunc)
}

export function removeReceiveHook(id: string) {
  receiveHooks.delete(id)
}
