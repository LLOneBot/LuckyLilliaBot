import { appendFileSync } from 'node:fs'
import { getLogger } from '@/common/logger'
import path from 'path'
import { LOG_DIR } from '@/common/globalVars'
import { hashPassword } from './passwordHash'
import { Context, Next } from 'hono'
import { webuiTokenUtil } from '../../../../../main/config'

interface GlobalLoginAttempt {
  consecutiveFailures: number
  lockedUntil: number | null
  lastAttempt: number
}

// 不按 IP 区分
const globalLoginAttempt: GlobalLoginAttempt = {
  consecutiveFailures: 0,
  lockedUntil: null,
  lastAttempt: 0,
}

const accessLogPath = path.join(LOG_DIR, 'webui_access.log')

export function logAccess(ip: string, method: string, path: string, status: number, message?: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp} | IP: ${ip} | ${method} ${path} | Status: ${status}${message ? ` | ${message}` : ''}\n`
  try {
    appendFileSync(accessLogPath, logEntry)
  } catch (err) {
    getLogger('webui-auth').error('写入访问日志失败:', err)
  }
}

setInterval(() => {
  if (globalLoginAttempt.lockedUntil) {
    const now = Date.now()
    if (now >= globalLoginAttempt.lockedUntil) {
      globalLoginAttempt.consecutiveFailures = 0
      globalLoginAttempt.lockedUntil = null
    }
  }
}, 60 * 60 * 1000)

const PASSWORD_FAILURE_MAX = 4

/** How the WebUI login refused a request; `reason` goes out in the X-Webui-Auth header. */
export interface LoginRefusal {
  status: 401 | 403
  reason: 'unset' | 'required' | 'wrong' | 'locked'
  body: Record<string, unknown>
}

/**
 * The password hash a request presents, checked against the WebUI password with the failures counting towards the
 * lockout. Every way in goes through here, the API's header or query and the plugin modules' cookie alike, so that
 * none is free to guess on. Undefined when the request may pass.
 */
export function checkToken(presented: string | undefined, ip: string, method: string, path: string): LoginRefusal | undefined {
  const token = webuiTokenUtil.getToken()
  if (!token) {
    logAccess(ip, method, path, 401, '未设置密码')
    return { status: 401, reason: 'unset', body: { success: false, message: '请先设置WebUI密码' } }
  }

  if (globalLoginAttempt.lockedUntil) {
    const now = Date.now()
    if (now < globalLoginAttempt.lockedUntil) {
      const remainingMinutes = Math.ceil((globalLoginAttempt.lockedUntil - now) / (60 * 1000))
      logAccess(ip, method, path, 403, `账户锁定中，剩余${remainingMinutes}分钟`)
      return {
        status: 403,
        reason: 'locked',
        body: { success: false, message: `密码错误次数过多，请在 ${remainingMinutes} 分钟后重试`, locked: true, remainingMinutes },
      }
    }
    globalLoginAttempt.consecutiveFailures = 0
    globalLoginAttempt.lockedUntil = null
  }

  if (!presented) return { status: 403, reason: 'required', body: { success: false, message: '请输入密码' } }

  if (presented !== hashPassword(token)) {
    globalLoginAttempt.consecutiveFailures++
    globalLoginAttempt.lastAttempt = Date.now()
    if (globalLoginAttempt.consecutiveFailures >= PASSWORD_FAILURE_MAX) {
      globalLoginAttempt.lockedUntil = Date.now() + (60 * 60 * 1000)
      logAccess(ip, method, path, 403, `密码连续错误${PASSWORD_FAILURE_MAX}次，账户锁定1小时`)
      return {
        status: 403,
        reason: 'locked',
        body: { success: false, message: `密码连续错误${PASSWORD_FAILURE_MAX}次，账户已被锁定1小时`, locked: true, remainingMinutes: 60 },
      }
    }
    const remainingAttempts = PASSWORD_FAILURE_MAX - globalLoginAttempt.consecutiveFailures
    logAccess(ip, method, path, 403, `Token验证失败，剩余${remainingAttempts}次尝试`)
    return {
      status: 403,
      reason: 'wrong',
      body: { success: false, message: `Token校验失败，剩余尝试次数：${remainingAttempts}`, remainingAttempts },
    }
  }

  if (globalLoginAttempt.consecutiveFailures > 0) {
    logAccess(ip, method, path, 200, '登录成功，重置失败计数')
    globalLoginAttempt.consecutiveFailures = 0
    globalLoginAttempt.lockedUntil = null
  }
  logAccess(ip, method, path, 200)
}

export async function authMiddleware(c: Context, next: Next) {
  // Setting the first password is the one thing done without one
  if (c.req.path === '/api/set-token' && !webuiTokenUtil.getToken()) return await next()
  const presented = c.req.header('X-Webui-Token') || c.req.query('token')
  const refusal = checkToken(presented, c.env.incoming.socket.remoteAddress, c.req.method, c.req.path)
  if (refusal) {
    // The WebUI asks for the password on these only, not on a 401 / 403 a route answers for reasons of its own
    c.header('X-Webui-Auth', refusal.reason)
    return c.json(refusal.body, refusal.status)
  }
  await next()
}
