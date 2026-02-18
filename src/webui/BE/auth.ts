import { Request, Response, NextFunction } from 'express'
import { appendFileSync } from 'node:fs'
import path from 'path'
import { LOG_DIR } from '@/common/globalVars'
import { webuiTokenUtil } from '@/common/config'
import { hashPassword } from './passwordHash'

// 全局密码错误记录
interface GlobalLoginAttempt {
  consecutiveFailures: number
  lockedUntil: number | null
  lastAttempt: number
}

// 全局登录失败记录（不基于IP）
let globalLoginAttempt: GlobalLoginAttempt = {
  consecutiveFailures: 0,
  lockedUntil: null,
  lastAttempt: 0,
}

const accessLogPath = path.join(LOG_DIR, 'webui_access.log')

// 记录访问日志
export function logAccess(ip: string, method: string, path: string, status: number, message?: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `${timestamp} | IP: ${ip} | ${method} ${path} | Status: ${status}${message ? ` | ${message}` : ''}\n`
  try {
    appendFileSync(accessLogPath, logEntry)
  } catch (err) {
    console.error('写入访问日志失败:', err)
  }
}

// 清理过期的锁定（每小时执行一次）
setInterval(() => {
  if (globalLoginAttempt.lockedUntil) {
    const now = Date.now()
    if (now >= globalLoginAttempt.lockedUntil) {
      globalLoginAttempt.consecutiveFailures = 0
      globalLoginAttempt.lockedUntil = null
    }
  }
}, 60 * 60 * 1000)

// 认证中间件
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'

  const token = webuiTokenUtil.getToken()
  if (!token) {
    if (req.path === '/set-token') return next()
    logAccess(clientIp, req.method, req.path, 401, '未设置密码')
    res.status(401).json({ success: false, message: '请先设置WebUI密码' })
    return
  }

  // 检查是否被全局锁定
  if (globalLoginAttempt.lockedUntil) {
    const now = Date.now()
    if (now < globalLoginAttempt.lockedUntil) {
      const remainingMinutes = Math.ceil((globalLoginAttempt.lockedUntil - now) / (60 * 1000))
      logAccess(clientIp, req.method, req.path, 403, `账户锁定中，剩余${remainingMinutes}分钟`)
      res.status(403).json({
        success: false,
        message: `密码错误次数过多，请在 ${remainingMinutes} 分钟后重试`,
        locked: true,
        remainingMinutes,
      })
      return
    } else {
      globalLoginAttempt.consecutiveFailures = 0
      globalLoginAttempt.lockedUntil = null
    }
  }

  const reqToken = req.headers['x-webui-token'] || req.query?.token
  if (!reqToken) {
    res.status(403).json({
      success: false,
      message: `请输入密码`,
    })
    return
  }

  const hashedToken = hashPassword(token)
  if (reqToken !== hashedToken) {
    globalLoginAttempt.consecutiveFailures++
    globalLoginAttempt.lastAttempt = Date.now()

    const passwordFailureMax = 4
    if (globalLoginAttempt.consecutiveFailures >= passwordFailureMax) {
      globalLoginAttempt.lockedUntil = Date.now() + (60 * 60 * 1000)
      logAccess(clientIp, req.method, req.path, 403, `密码连续错误${passwordFailureMax - 1}次，账户锁定1小时`)
      res.status(403).json({
        success: false,
        message: '密码连续错误3次，账户已被锁定1小时',
        locked: true,
        remainingMinutes: 60,
      })
      return
    }

    const remainingAttempts = passwordFailureMax - globalLoginAttempt.consecutiveFailures
    logAccess(clientIp, req.method, req.path, 403, `Token验证失败，剩余${remainingAttempts}次尝试`)
    res.status(403).json({
      success: false,
      message: `Token校验失败，剩余尝试次数：${remainingAttempts}`,
      remainingAttempts,
    })
    return
  }

  // 登录成功，重置失败记录
  if (globalLoginAttempt.consecutiveFailures > 0) {
    logAccess(clientIp, req.method, req.path, 200, '登录成功，重置失败计数')
    globalLoginAttempt.consecutiveFailures = 0
    globalLoginAttempt.lockedUntil = null
  }

  logAccess(clientIp, req.method, req.path, 200)
  next()
}
