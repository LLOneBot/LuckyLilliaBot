import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from 'cordis'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import { dbDir, selfInfo } from '@/common/globalVars'
import { ProtocolSelection, resolveProtocolSelection, setProtocolSelection } from '@/common/utils/environment'
import { currentInstance } from '@/common/instance'
import { configPaths } from '@/common/configPaths'
import type { NTProtocolConfig } from '@/common/types'
import Core from './ntqqapi/core'
import {
  NTFileApi,
  NTFriendApi,
  NTGroupApi,
  NTLoginApi,
  NTMsgApi,
  NTSystemApi,
  NTUserApi,
  NTWebApi,
} from './ntqqapi/api'
import { NTLoginRoutes } from './loginRoutes'
import { NTStatsRoutes } from './statsRoutes'
import { DirectQQProtocolClient, PmhqQQProtocolClient } from './qqProtocol'
import AccountService from './account'
import Store from './store'
import { setLoginState, startIpcServer } from './llbot-ipc'
import { NTProtocolSchema } from './settings'

export const name = 'nt-protocol'
export const inject = ['config']
export const Config = NTProtocolSchema

const selectionOf = (config: NTProtocolConfig): ProtocolSelection => resolveProtocolSelection({
  mode: config.mode,
  protocol: config.protocol,
  pmhq: { host: config.pmhq.host, port: String(config.pmhq.port) },
})

/**
 * The scanned QQ account: the protocol (pure, or PMHQ bridging an official QQ client), the NT APIs, the `account`
 * gate and, once logged in, the database, Core and Store. Switching it off takes all of that down, and everything
 * built on it (the OneBot / Satori / Milky adapters, WebQQ, the neutral layer's NT bot) waits until it is back.
 */
export function apply(ctx: Context, config: NTProtocolConfig) {
  const logger = ctx.logger('nt-protocol')
  let selection = selectionOf(config)
  setProtocolSelection(selection)
  // Only another mode, or PMHQ elsewhere, remounts the protocol (logging the account out). The pure protocol reads
  // its protocol once, as its client is created: before that a new one just applies, after it waits for a restart
  ctx.on('internal/update', (next: NTProtocolConfig, restart) => {
    const updated = selectionOf(next)
    const moved = updated.pmhq.host !== selection.pmhq.host || updated.pmhq.port !== selection.pmhq.port
    if (updated.mode !== selection.mode || (updated.mode === 'pmhq' && moved)) return restart()
    setProtocolSelection(selection = updated)
  })
  ctx.plugin(selection.mode === 'pmhq' ? PmhqQQProtocolClient : DirectQQProtocolClient)
  ctx.plugin(NTFileApi)
  ctx.plugin(NTFriendApi)
  ctx.plugin(NTGroupApi)
  ctx.plugin(NTLoginApi)
  ctx.plugin(NTMsgApi)
  ctx.plugin(NTUserApi)
  ctx.plugin(NTWebApi)
  ctx.plugin(NTSystemApi)
  ctx.plugin(AccountService)
  ctx.plugin(NTLoginRoutes)
  ctx.plugin(NTStatsRoutes)

  // The database is per account, so this waits for the first login; `account` survives reconnects, so it runs once
  ctx.inject(['account', 'config'], (ctx) => {
    const config = ctx.config.get()
    ctx.plugin(Database)
    ctx.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${ctx.account.uin}.v3.db`)).href,
    })
    ctx.plugin(Core, config)
    ctx.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire!,
    })
  })

  const handleOnline = () => {
    console.log(`
  _                _            _     _ _ _ _
 | |    _   _  ___| | ___   _  | |   (_) | (_) __ _
 | |   | | | |/ __| |/ / | | | | |   | | | | |/ _\` |
 | |___| |_| | (__|   <| |_| | | |___| | | | | (_| |
 |_____|\\__,_|\\___|_|\\_\\\\__, | |_____|_|_|_|_|\\__,_|
                        |___/
                                        UIN: ${selfInfo.uin}
`)
    setLoginState({ state: 'logged_in', uin: selfInfo.uin, nickname: selfInfo.nick })
    const instance = currentInstance().name
    if (selfInfo.uin !== instance && existsSync(configPaths.instance(selfInfo.uin))) {
      logger.info(`QQ ${selfInfo.uin} 有自己的实例 ${selfInfo.uin}，这次用的是实例 ${instance}；要用那份配置请以 --instance ${selfInfo.uin} 启动`)
    }
  }
  ctx.on('qq/online', handleOnline)
  ctx.on('llbot/self-nick-changed', (info) => {
    setLoginState({ nickname: info.nick })
  })
  ctx.on('protocol/disconnect', () => {
    logger.info('协议层断开，等待重连…')
  })

  // 两种模式都启动 IPC server: Desktop 统一通过 IPC 拿 uin/昵称
  startIpcServer()
  setLoginState({ state: 'initializing' })
}
