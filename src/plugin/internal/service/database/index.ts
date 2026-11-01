import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from 'cordis'
import Database from '@cordisjs/plugin-database'
import SQLiteDriver from '@cordisjs/plugin-database-sqlite'
import { configPaths } from '@/common/configPaths'

export const name = 'database'

/**
 * `ctx.database` for the plugins: one SQLite file in the instance directory, up from the start, whichever account
 * logs in or none. The QQ account keeps its own tables in a database of its own (builtin:nt-protocol).
 */
export function apply(ctx: Context) {
  const file = configPaths.database()
  mkdirSync(path.dirname(file), { recursive: true })
  ctx.plugin(Database)
  ctx.plugin(SQLiteDriver, { path: pathToFileURL(file).href })
}
