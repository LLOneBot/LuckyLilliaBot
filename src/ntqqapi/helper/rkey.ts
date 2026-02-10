import { Context } from 'cordis'

interface ServerRkeyData {
  group_rkey: string
  private_rkey: string
  expired_time: number
}

export class RkeyManager {
  private serverUrl: string = ''
  private rkeyData: ServerRkeyData = {
    group_rkey: '',
    private_rkey: '',
    expired_time: 0
  }

  constructor(protected ctx: Context, serverUrl: string) {
    this.serverUrl = serverUrl
  }

  async getRkey(refresh = false) {
    if (this.isExpired() || refresh) {
      try {
        await this.refreshRkey()
      } catch (e) {
        this.ctx.logger.error('获取rkey失败', e)
      }
    }
    return this.rkeyData
  }

  isExpired(): boolean {
    const now = new Date().getTime() / 1000
    return now > this.rkeyData.expired_time
  }

  async refreshRkey() {
    try {
      const { privateRKey, groupRKey, expiredTime } = await this.ctx.get('app')!.pmhq.getRKey()
      this.rkeyData = {
        private_rkey: privateRKey,
        group_rkey: groupRKey,
        expired_time: expiredTime
      }
      this.ctx.logger.info(`发包获取rkey成功, private:${privateRKey}, group:${groupRKey}`)
    }
    catch (e) {
      this.ctx.logger.warn(`发包获取rkey失败 ${e}，开始获取远程rkey`)
      try {
        this.rkeyData = await this.fetchServerRkey()
      } catch (e) {
        this.ctx.logger.error('获取远程rkey失败', e)
      }
    }
  }

  async fetchServerRkey(): Promise<ServerRkeyData> {
    const response = await fetch(this.serverUrl)
    if (!response.ok) {
      throw new Error(response.statusText)
    }
    return response.json()
  }
}
