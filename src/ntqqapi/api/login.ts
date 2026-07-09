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
    // Direct 模式: 从本地 qq-session-<uin>.json 扫出候选. PMHQ 模式: 默认返空 (QQ NT 已登过, WebUI 用不上).
    const accounts = this.ctx.qqProtocol.listQuickLoginAccounts()
    return {
      LocalLoginInfoList: accounts.map(a => ({
        uin: a.uin,
        uid: a.uid,
        nickName: a.nick,
        // QQ 头像公共 API, 无需鉴权; s=100 拿 100x100 头像
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
