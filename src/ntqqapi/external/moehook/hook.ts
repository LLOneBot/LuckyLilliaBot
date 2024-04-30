import { log } from '../../../common/utils'
import * as os from 'os'

interface MoeHook {
  GetRkey: () => string // Return '&rkey=xxx'
  HookRkey: () => string
}

class HookApi {
  private readonly moeHook: MoeHook | null = null

  constructor() {
    try {
      const systemPlatform = os.platform()
      const cpuArch = os.arch()
      this.moeHook = require(`./MoeHoo-${systemPlatform}-${cpuArch}.node`)
      console.log('hook rkey地址', this.moeHook!.HookRkey())
    } catch (e) {
      console.log('加载 moehoo 失败', e)
    }
  }

  getRKey(): string {
    return this.moeHook?.GetRkey() || ''
  }

  isAvailable() {
    return !!this.moeHook
  }
}

export const hookApi = new HookApi()
