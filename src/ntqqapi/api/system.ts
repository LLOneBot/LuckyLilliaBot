import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    ntSystemApi: NTQQSystemApi
  }
}

export class NTQQSystemApi extends Service {
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
    return { devType: 'Linux', buildVer: '3.2.28-48517' }
  }

  async scanQRCode(_path: string): Promise<any> {
    throw new Error('scanQRCode 在直连模式下不支持')
  }
}
