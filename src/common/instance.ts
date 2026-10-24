import { existsSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '@/common/globalVars'
import { getInstanceArg, getSpecifiedUin } from '@/common/utils/environment'

export const DEFAULT_INSTANCE = 'default'

// Also a directory name and part of a lock name: nothing Windows or a pipe name would trip over
const INSTANCE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function isValidInstanceName(name: string): boolean {
  return INSTANCE_NAME.test(name)
}

export function instancesDir(): string {
  return path.join(DATA_DIR, 'instances')
}

export interface InstanceChoice {
  name: string
  /** Why this one, for the startup log. */
  reason: string
}

/**
 * --instance, else LLBOT_INSTANCE, else the instance named after `-q <uin>` if there is one (what the migration
 * makes for an old account whose settings differed), else default. See config-storage §4.
 */
export function resolveInstance(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): InstanceChoice {
  const fromArgv = getInstanceArg(argv, {})
  const requested = fromArgv ?? getInstanceArg([], env)
  if (requested !== undefined) {
    if (!isValidInstanceName(requested)) {
      throw new Error(`实例名 "${requested}" 不合法：只能用字母、数字、_ 和 -，以字母或数字开头，最长 64 个字符`)
    }
    return { name: requested, reason: fromArgv !== undefined ? '--instance' : 'LLBOT_INSTANCE' }
  }
  const uin = getSpecifiedUin(argv)
  if (uin && isValidInstanceName(uin) && existsSync(path.join(instancesDir(), uin))) {
    return { name: uin, reason: `-q ${uin}，且有同名实例` }
  }
  return { name: DEFAULT_INSTANCE, reason: '默认实例' }
}

let current: InstanceChoice | undefined

/**
 * The instance this process runs, fixed on first use. main.ts makes that first use after the startup migration,
 * which may create the instance `-q` points to.
 */
export function currentInstance(): InstanceChoice {
  return current ??= resolveInstance()
}
