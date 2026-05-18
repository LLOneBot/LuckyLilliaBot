import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'

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

  async getQuickLoginList(){
    return { LocalLoginInfoList: selfInfo.uin ? [{ uin: selfInfo.uin, uid: selfInfo.uid, isQuickLogin: true }] : [] } as any
  }

  async quickLoginWithUin(uin: string){
    throw new Error('quickLoginWithUin: 直连模式自动恢复 session，无需此接口')
  }

  async getLoginQrCode(){
    return await this.ctx.qqProtocol.getDirectLoginQrCode()
  }
}
