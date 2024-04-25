import {log} from "../../../common/utils";

interface MoeHook {
  GetRkey: () => string,  // Return '&rkey=xxx'
  HookRkey: () => string
}


class HookApi {
  private readonly moeHook: MoeHook | null = null;

  constructor() {
    try {
      this.moeHook = require('./MoeHook.node');
      console.log("hook rkey地址", this.moeHook!.HookRkey());
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

export const hookApi = new HookApi();
