import { randomUUID } from 'node:crypto'
import { Awaitable } from 'cosmokit'
import { NTMethod } from './ntcall'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { NodeIKernelLoginListener, NodeIKernelBuddyListener } from '@/ntqqapi/listeners'

export enum ReceiveCmdS {
  INIT = 'nodeIQQNTWrapperSessionListener/onSessionInitComplete',
  LOGIN_QR_CODE = 'nodeIKernelLoginListener/onQRCodeGetPicture',
  RECENT_CONTACT = 'nodeIKernelRecentContactListener/onRecentContactListChangedVer2',
  UPDATE_MSG = 'nodeIKernelMsgListener/onMsgInfoListUpdate',
  UPDATE_ACTIVE_MSG = 'nodeIKernelMsgListener/onActiveMsgInfoUpdate',
  NEW_MSG = 'nodeIKernelMsgListener/onRecvMsg',
  DELETE_MSG = 'nodeIKernelMsgListener/onMsgDelete',
  NEW_ACTIVE_MSG = 'nodeIKernelMsgListener/onRecvActiveMsg',
  SELF_SEND_MSG = 'nodeIKernelMsgListener/onAddSendMsg',
  USER_INFO = 'nodeIKernelProfileListener/onProfileSimpleChanged',
  USER_DETAIL_INFO = 'nodeIKernelProfileListener/onProfileDetailInfoChanged',
  GROUPS = 'nodeIKernelGroupListener/onGroupListUpdate',
  GROUPS_STORE = 'onGroupListUpdate',
  GROUP_MEMBER_INFO_UPDATE = 'nodeIKernelGroupListener/onMemberInfoChange',
  FRIENDS = 'nodeIKernelBuddyListener/onBuddyListChange',
  MEDIA_DOWNLOAD_COMPLETE = 'nodeIKernelMsgListener/onRichMediaDownloadComplete',
  UNREAD_GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupNotifiesUnreadCountUpdated',
  GROUP_NOTIFY = 'nodeIKernelGroupListener/onGroupSingleScreenNotifies',
  FRIEND_REQUEST = 'nodeIKernelBuddyListener/onBuddyReqChange',
  SELF_STATUS = 'nodeIKernelProfileListener/onSelfStatusChanged',
  CACHE_SCAN_FINISH = 'nodeIKernelStorageCleanListener/onFinishScan',
  MEDIA_UPLOAD_COMPLETE = 'nodeIKernelMsgListener/onRichMediaUploadComplete',
  FLASH_FILE_DOWNLOAD_STATUS = 'nodeIKernelFlashTransferListener/onFileSetDownloadTaskStatusChange',
  FLASH_FILE_DOWNLOADING = 'nodeIKernelFlashTransferListener/onFileSetDownloadTaskProgressChanged',
  FLASH_FILE_UPLOAD_STATUS = 'nodeIKernelFlashTransferListener/onFileSetUploadStatusChanged',
  FLASH_FILE_UPLOADING = 'nodeIKernelFlashTransferListener/onFileSetUploadProgressChanged',
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
  'on_profile': 'nodeIKernelProfileListener',
  'on_flash_file': 'nodeIKernelFlashTransferListener',
}

export function startHook() {
  pmhq.addResListener((data) => {
    let listenerName = data.type
    if ('sub_type' in data.data) {
      const sub_type = data.data.sub_type
      const convertedListenerName = NT_RECV_PMHQ_TYPE_TO_NT_METHOD[listenerName as keyof typeof NT_RECV_PMHQ_TYPE_TO_NT_METHOD] || listenerName
      const ntCmd: ReceiveCmdS = (convertedListenerName + '/' + sub_type) as ReceiveCmdS
      if (logHook) {
        console.info(ntCmd, data.data)
      }
      for (const hook of receiveHooks.values()) {
        if (hook.method.includes(ntCmd)) {
          Promise.resolve(hook.hookFunc(data.data.data))
        }
      }
    }
  })
}

export interface NTListener {
  nodeIKernelLoginListener: NodeIKernelLoginListener
  nodeIKernelBuddyListener: NodeIKernelBuddyListener
}

// 辅助类型：从method字符串推断出对应的payload类型
export type InferPayloadFromMethod<T extends string> =
  T extends `${infer S}/${infer M}`
    ? S extends keyof NTListener
      ? M extends keyof NTListener[S]
        ? NTListener[S][M] extends (...args: any) => unknown
          ? Parameters<NTListener[S][M]>[0]
          : never
        : never
      : never
    : never

export function registerReceiveHook<
  PayloadType = any,
  Method extends string = string
>(
  method: Method | Method[],
  hookFunc: (payload: InferPayloadFromMethod<Method> extends never ? PayloadType : InferPayloadFromMethod<Method>) => Awaitable<void>,
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
