import { Context, Service } from 'cordis'
import { invoke } from '@/ntqqapi/ntcall'
import { ReceiveCmdS } from '@/ntqqapi/hook'

declare module 'cordis' {
  interface Context {
    ntLoginApi: NTLoginApi
  }
}

export class NTLoginApi extends Service {
  static inject = []

  constructor(protected ctx: Context) {
    super(ctx, 'ntLoginApi', true)
  }

  async getQuickLoginList(){
    return await invoke('nodeIKernelLoginService/getLoginList', [])
  }

  async quickLoginWithUin(uin: string){
    return await invoke('nodeIKernelLoginService/quickLoginWithUin', [uin], {
    })
  }

  async getLoginQrCode(){
    return await invoke('nodeIKernelLoginService/getQRCodePicture', [], {
      resultCmd: ReceiveCmdS.LOGIN_QR_CODE,
    })
  }
}
