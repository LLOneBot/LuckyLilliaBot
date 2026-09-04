import { Context, Service } from 'cordis'
import { AppInfo, DeviceInfo } from '../../main/qqProtocol/direct-lib/appInfo'

declare module 'cordis' {
  interface Context {
    ntSystemApi: NTSystemApi
  }
}

export class NTSystemApi extends Service {
  static inject = ['qqProtocol']

  constructor(protected ctx: Context) {
    super(ctx, 'ntSystemApi')
  }

  async restart() {
    // 直连模式无需此操作（重启进程即可）
  }

  async getSettingAutoLogin() {
    // 直连模式：session 持久化即自动登录
    return true
  }

  async setSettingAutoLogin(_state: boolean) {
    // 直连模式：无操作
  }

  async getDeviceInfo() {
    // 跟随当前激活协议 (--protocol); 供 milky get_impl_info + WebUI dashboard 显示。
    return { devType: DeviceInfo.devType, buildVer: AppInfo.buildVer }
  }
}
