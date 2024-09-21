import {
  NodeIKernelBuddyService,
  NodeIKernelGroupService,
  NodeIKernelProfileService,
  NodeIKernelProfileLikeService,
  NodeIKernelMSFService,
  NodeIKernelMsgService,
  NodeIKernelUixConvertService,
  NodeIKernelRichMediaService,
  NodeIKernelTicketService,
  NodeIKernelTipOffService
} from './services'
import { constants } from 'node:os'
import { Dict } from 'cosmokit'
const Process = require('node:process')

export interface NodeIQQNTWrapperSession {
  getBuddyService(): NodeIKernelBuddyService
  getGroupService(): NodeIKernelGroupService
  getProfileService(): NodeIKernelProfileService
  getProfileLikeService(): NodeIKernelProfileLikeService
  getMsgService(): NodeIKernelMsgService
  getMSFService(): NodeIKernelMSFService
  getUixConvertService(): NodeIKernelUixConvertService
  getRichMediaService(): NodeIKernelRichMediaService
  getTicketService(): NodeIKernelTicketService
  getTipOffService(): NodeIKernelTipOffService
}

export interface WrapperApi {
  NodeIQQNTWrapperSession?: NodeIQQNTWrapperSession
}

const wrapperApi: WrapperApi = {}

Process.dlopenOrig = Process.dlopen

Process.dlopen = function (module: Dict, filename: string, flags = constants.dlopen.RTLD_LAZY) {
  const dlopenRet = this.dlopenOrig(module, filename, flags)
  for (const export_name in module.exports) {
    module.exports[export_name] = new Proxy(module.exports[export_name], {
      construct: (target, args) => {
        const ret = new target(...args)
        if (export_name === 'NodeIQQNTWrapperSession') wrapperApi.NodeIQQNTWrapperSession = ret
        return ret
      }
    })
  }
  return dlopenRet
}

export function getSession() {
  return wrapperApi['NodeIQQNTWrapperSession']
}
