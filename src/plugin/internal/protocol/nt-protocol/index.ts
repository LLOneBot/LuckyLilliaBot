import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from 'cordis'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import { dbDir } from '@/common/globalVars'
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
import { DirectQQProtocolClient, NativeQQProtocolClient } from './qqProtocol'
import AccountService from './account'
import Store from './store'
import { NTProtocolSchema } from './settings'

export const name = 'nt-protocol'
export const inject = ['config']
export const Config = NTProtocolSchema

const selectionOf = (config: NTProtocolConfig): ProtocolSelection => resolveProtocolSelection(config)

/**
 * The scanned QQ account: the protocol (pure, or NativeQQ bridging an official QQ client), the NT APIs, the `account`
 * gate and, once logged in, the database, Core and Store. Switching it off takes all of that down, and everything
 * built on it (the OneBot / Satori / Milky adapters, WebQQ, the neutral layer's NT bot) waits until it is back.
 */
export function apply(ctx: Context, config: NTProtocolConfig) {
  const logger = ctx.logger('nt-protocol')
  let selection = selectionOf(config)
  setProtocolSelection(selection)
  // Only another mode, or another QQ for the bridge, remounts the protocol (logging the account out). The pure protocol
  // reads its protocol once, as its client is created: before that a new one just applies, after it waits for a restart
  ctx.on('internal/update', (next: NTProtocolConfig, restart) => {
    const updated = selectionOf(next)
    const moved = updated.nativeQQ.qqPath !== selection.nativeQQ.qqPath
    if (updated.mode !== selection.mode || (updated.mode === 'nativeqq' && moved)) return restart()
    setProtocolSelection(selection = updated)
  })
  ctx.plugin(selection.mode === 'nativeqq' ? NativeQQProtocolClient : DirectQQProtocolClient)
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

  // The account's own tables are per account, so this waits for the first login; `account` survives reconnects, so
  // it runs once. Its database is isolated: the plugins' ctx.database is the instance's (builtin:database)
  ctx.inject(['account', 'config'], (ctx) => {
    const config = ctx.config.get()
    const own = ctx.isolate('database').isolate('model')
    own.plugin(Database)
    own.plugin(SQLiteDriver, {
      path: pathToFileURL(path.join(dbDir, `${ctx.account.uin}.v3.db`)).href,
    })
    own.plugin(Core, config)
    own.plugin(Store, {
      msgCacheExpire: config.msgCacheExpire!,
    })
  })

  const handleOnline = () => {
    const { uin } = ctx.get('qqProtocol')!.selfInfo
    console.log(`
  _                _            _     _ _ _ _
 | |    _   _  ___| | ___   _  | |   (_) | (_) __ _
 | |   | | | |/ __| |/ / | | | | |   | | | | |/ _\` |
 | |___| |_| | (__|   <| |_| | | |___| | | | | (_| |
 |_____|\\__,_|\\___|_|\\_\\\\__, | |_____|_|_|_|_|\\__,_|
                        |___/
                                        UIN: ${uin}
`)
    const instance = currentInstance().name
    if (uin !== instance && existsSync(configPaths.instance(uin))) {
      logger.info(`QQ ${uin} 有自己的实例 ${uin}，这次用的是实例 ${instance}；要用那份配置请以 --instance ${uin} 启动`)
    }
  }
  ctx.on('qq/online', handleOnline)
  ctx.on('protocol/disconnect', () => {
    logger.info('协议层断开，等待重连…')
  })
}
