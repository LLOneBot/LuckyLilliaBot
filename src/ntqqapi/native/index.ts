import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import { getBuildVersion } from '@/common/utils/misc'
// @ts-expect-error: Unreachable code error
import addon from './external/crychic-win32-x64.node?asset'

export class Native {
  private crychic?: Dict

  constructor(private ctx: Context) {
    ctx.on('ready', () => {
      this.start()
    })
  }

  checkPlatform() {
    return process.platform === 'win32' && process.arch === 'x64'
  }

  checkVersion() {
    const version = getBuildVersion()
    // 27187—27597
    return version >= 27187 && version < 28060
  }

  start() {
    if (this.crychic) {
      return
    }
    if (!this.checkPlatform()) {
      return
    }
    if (!this.checkVersion()) {
      return
    }
    try {
      this.crychic = require(addon)
      this.crychic.init()
    } catch (e) {
      this.ctx.logger.warn('crychic 加载失败', e)
    }
  }

  async sendFriendPoke(uin: number) {
    if (!this.crychic) return
    this.crychic.sendFriendPoke(uin)
    await this.ctx.ntMsgApi.fetchUnitedCommendConfig(['100243'])
  }

  async sendGroupPoke(groupCode: number, memberUin: number) {
    if (!this.crychic) return
    this.crychic.sendGroupPoke(memberUin, groupCode)
    await this.ctx.ntMsgApi.fetchUnitedCommendConfig(['100243'])
  }
}
