import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    ntLoginApi: NTLoginApi
  }
}

export class NTLoginApi extends Service {
  static inject = ['qqProtocol']

  constructor(protected ctx: Context) {
    super(ctx, 'ntLoginApi')
  }

  async getQuickLoginList() {
    const accounts = this.ctx.qqProtocol.listQuickLoginAccounts()
    return {
      LocalLoginInfoList: accounts.map(a => ({
        uin: a.uin,
        uid: a.uid,
        nickName: a.nick,
        faceUrl: `https://q1.qlogo.cn/g?b=qq&nk=${a.uin}&s=100`,
        loginType: 0,
        isQuickLogin: true,
        isAutoLogin: false,
        isUserLogin: false,
      })),
    }
  }

  async getLoginQrCode() {
    return await this.ctx.qqProtocol.getLoginQrCode()
  }
}
