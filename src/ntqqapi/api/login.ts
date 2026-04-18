import { Context, Service } from 'cordis'
import { ReceiveCmdS } from '@/ntqqapi/hook'

declare module 'cordis' {
  interface Context {
    ntLoginApi: NTLoginApi
  }
}

export class NTLoginApi extends Service {
  static inject = ['pmhq']

  constructor(protected ctx: Context) {
    super(ctx, 'ntLoginApi')
  }

  async getQuickLoginList(){
    return await this.ctx.pmhq.invoke('nodeIKernelLoginService/getLoginList', [])
  }

  async quickLoginWithUin(uin: string){
    return await this.ctx.pmhq.invoke('nodeIKernelLoginService/quickLoginWithUin', [uin], {
    })
  }

  async getLoginQrCode(){
    return await this.ctx.pmhq.invoke('nodeIKernelLoginService/getQRCodePicture', [], {
      resultCmd: ReceiveCmdS.LOGIN_QR_CODE,
    })
  }
}
