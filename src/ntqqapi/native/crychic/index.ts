import { Context } from 'cordis'
import { Dict } from 'cosmokit'
import { getBuildVersion } from '../../../common/utils/misc'
import { TEMP_DIR } from '../../../common/globalVars'
import { copyFile } from 'fs/promises'
import { ChatType, Peer } from '../../types'
import path from 'node:path'
import addon from './external/crychic-win32-x64.node?asset'

export class Native {
  public activated = false
  private crychic?: Dict
  private seq = 0
  private cb: Map<number, Function> = new Map()

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
    // 27333—27597
    return version >= 27333 && version < 28060
  }

  async start() {
    if (this.crychic) {
      return
    }
    if (!this.checkPlatform()) {
      return
    }
    if (!this.checkVersion()) {
      return
    }
    const handler = async (name: string, ...e: unknown[]) => {
      if (name === 'cb') {
        this.cb.get(e[0] as number)?.(e[1])
      }
    }
    try {
      const fileName = path.basename(addon)
      const dest = path.join(TEMP_DIR, fileName)
      try {
        await copyFile(addon, dest)
      } catch (e) {
        // resource busy or locked?
        this.ctx.logger.warn(e)
      }
      this.crychic = require(dest)
      this.crychic!.setCryHandler(handler)
      this.crychic!.init()
      this.activated = true
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

  uploadForward(peer: Peer, transmit: Uint8Array) {
    return new Promise<string>(async (resolve, reject) => {
      if (!this.crychic) return
      let groupCode = 0
      const uid = peer.peerUid
      const isGroup = peer.chatType === ChatType.Group
      if (isGroup) {
        groupCode = +uid
      }
      const seq = ++this.seq
      this.cb.set(seq, (resid: string) => {
        this.cb.delete(seq)
        resolve(resid)
      })
      setTimeout(() => {
        this.cb.delete(seq)
        reject(new Error('fake forward timeout'))
      }, 5000)
      this.crychic.uploadForward(seq, isGroup, uid, groupCode, transmit)
      await this.ctx.ntMsgApi.fetchUnitedCommendConfig(['100243'])
    })
  }
}
