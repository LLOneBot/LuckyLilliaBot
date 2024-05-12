import {cpModule} from "../cpmodule";
import { qqPkgInfo } from '@/common/utils/QQBasicInfo'

interface MoeHook {
  GetRkey: () => string,  // Return '&rkey=xxx'
  HookRkey: (version: string) => string
}


class HookApi {
  private readonly moeHook: MoeHook | null = null;

  constructor() {
    cpModule('MoeHoo');
    try {
      this.moeHook = require('./MoeHoo.node');
      console.log("hook rkey qq version", this.moeHook!.HookRkey(qqPkgInfo.version));
      console.log("hook rkey地址", this.moeHook!.HookRkey(qqPkgInfo.version));
    } catch (e) {
      console.log('加载 moehoo 失败', e);
    }
  }

  getRKey(): string {
    return this.moeHook?.GetRkey() || '';
  }

  isAvailable() {
    return !!this.moeHook;
  }
}

// export const hookApi = new HookApi();
