import { NodeIKernelBuddyService } from './services/NodeIKernelBuddyService'
import os from 'node:os'
const Process = require('node:process')

export interface NodeIQQNTWrapperSession {
  [key: string]: any
  getBuddyService(): NodeIKernelBuddyService
}

export interface WrapperApi {
  NodeIQQNTWrapperSession?: NodeIQQNTWrapperSession
}

export interface WrapperConstructor {
  [key: string]: any
  NodeIKernelBuddyListener?: any
  NodeIKernelGroupListener?: any
  NodeQQNTWrapperUtil?: any
  NodeIKernelMsgListener?: any
  NodeIQQNTWrapperEngine?: any
  NodeIGlobalAdapter?: any
  NodeIDependsAdapter?: any
  NodeIDispatcherAdapter?: any
  NodeIKernelSessionListener?: any
  NodeIKernelLoginService?: any
  NodeIKernelLoginListener?: any
  NodeIKernelProfileService?: any
  NodeIKernelProfileListener?: any
}

export const wrapperApi: WrapperApi = {}

export const wrapperConstructor: WrapperConstructor = {}

const constructor = [
  'NodeIKernelBuddyListener',
  'NodeIKernelGroupListener',
  'NodeQQNTWrapperUtil',
  'NodeIKernelMsgListener',
  'NodeIQQNTWrapperEngine',
  'NodeIGlobalAdapter',
  'NodeIDependsAdapter',
  'NodeIDispatcherAdapter',
  'NodeIKernelSessionListener',
  'NodeIKernelLoginService',
  'NodeIKernelLoginListener',
  'NodeIKernelProfileService',
  'NodeIKernelProfileListener',
]

Process.dlopenOrig = Process.dlopen

Process.dlopen = function (module, filename, flags = os.constants.dlopen.RTLD_LAZY) {
  const dlopenRet = this.dlopenOrig(module, filename, flags)
  for (let export_name in module.exports) {
    module.exports[export_name] = new Proxy(module.exports[export_name], {
      construct: (target, args, _newTarget) => {
        const ret = new target(...args)
        if (export_name === 'NodeIQQNTWrapperSession') wrapperApi.NodeIQQNTWrapperSession = ret
        return ret
      }
    })
    if (constructor.includes(export_name)) {
      wrapperConstructor[export_name] = module.exports[export_name]
    }
  }
  return dlopenRet
}