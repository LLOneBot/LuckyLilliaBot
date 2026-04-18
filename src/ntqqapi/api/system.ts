import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    ntSystemApi: NTQQSystemApi
  }
}

export class NTQQSystemApi extends Service {
  static inject = ['pmhq']

  constructor(protected ctx: Context) {
    super(ctx, 'ntSystemApi')
  }

  async restart() {
    // todo: 调用此接口后会将 NTQQ 设置里面的自动登录和无需手机确认打开，重启后将状态恢复到之前的状态

    // 设置自动登录
    await this.setSettingAutoLogin(true)
    // 退出账号
    // invoke('quitAccount', []).then()
    // invoke('notifyQQClose', [{ type: 1 }]).then()
    // // 等待登录界面，模拟点击登录按钮？还是直接调用登录方法？
  }

  async getSettingAutoLogin() {
    // 查询是否自动登录
    return await this.ctx.pmhq.invoke('nodeIKernelNodeMiscService/queryAutoRun', [])
  }

  async setSettingAutoLogin(state: boolean) {
    await this.ctx.pmhq.invoke<unknown>('nodeIKernelSettingService/setNeedConfirmSwitch', [1]) // 1：不需要手机确认，2：需要手机确认

    await this.ctx.pmhq.invoke<unknown>('nodeIKernelSettingService/setAutoLoginSwitch', [state])
  }

  async getDeviceInfo() {
    return await this.ctx.pmhq.invoke<{
      devType: string
      buildVer: string
    }>('getDeviceInfo', [])
  }

  async scanQRCode(path: string){
    return await this.ctx.pmhq.invoke('nodeIKernelNodeMiscService/scanQBar', [path])
  }
}
