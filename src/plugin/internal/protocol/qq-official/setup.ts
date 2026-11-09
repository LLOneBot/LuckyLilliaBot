import { createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import type { Context } from 'cordis'
import QRCode from 'qrcode'
import { PluginRevConflictError } from '../../../host'
import type { QQSetupState } from './setupTypes'

const SESSION_TIMEOUT = 10 * 60_000
const REQUEST_TIMEOUT = 10_000
const POLL_INTERVAL = 2000
const API = 'https://q.qq.com/lite/'
const terminal = new Set<QQSetupState['phase']>(['complete', 'failed', 'cancelled', 'expired'])

export class QQSetupError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 503 = 409) {
    super(message)
  }
}

interface SetupSession {
  state: QQSetupState
  controller: AbortController
  deadline: number
  stopDeadline: () => void
  key?: Buffer
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One instance owns one setup session; HTTP GET never starts or polls a remote task. */
export class QQOfficialSetup {
  private active?: SetupSession
  private readonly sessions = new Map<string, SetupSession>()
  private disposed = false

  constructor(private readonly ctx: Context) {}

  start(): QQSetupState {
    if (this.disposed) throw new QQSetupError('扫码配置暂不可用，请稍后重试', 503)
    if (this.active?.state.phase === 'saving') throw new QQSetupError('正在保存配置，请稍候')
    if (this.active && !terminal.has(this.active.state.phase)) this.finish(this.active, 'cancelled', '已换用新的二维码')
    const session: SetupSession = {
      state: { id: randomUUID(), phase: 'starting' },
      controller: new AbortController(),
      deadline: Date.now() + SESSION_TIMEOUT,
      stopDeadline: () => {},
    }
    this.active = session
    this.sessions.set(session.state.id, session)
    // Retain a few terminal states for a tab still polling an old session; no QR or keys remain in them.
    while (this.sessions.size > 16) this.sessions.delete(this.sessions.keys().next().value!)
    session.stopDeadline = this.ctx.timer.setTimeout(() => {
      if (this.live(session)) this.finish(session, 'expired', '本次扫码已超时，请重新获取二维码')
    }, SESSION_TIMEOUT)
    void this.run(session)
    return { ...session.state }
  }

  get(id: string): QQSetupState {
    const session = this.sessions.get(id)
    if (!session) throw new QQSetupError('扫码会话不存在，请重新获取二维码', 404)
    return { ...session.state }
  }

  cancel(id: string): QQSetupState {
    const session = this.sessions.get(id)
    if (!session) throw new QQSetupError('扫码会话不存在', 404)
    // updateConfig is an atomic operation with no cancellation API. Once it starts, wait for its result.
    if (session.state.phase === 'saving') throw new QQSetupError('正在保存配置，请稍候')
    if (!terminal.has(session.state.phase)) this.finish(session, 'cancelled', '已取消扫码')
    return { ...session.state }
  }

  dispose(): void {
    this.disposed = true
    for (const session of this.sessions.values()) {
      if (!terminal.has(session.state.phase)) this.finish(session, 'cancelled', '扫码配置已停止')
    }
  }

  private live(session: SetupSession): boolean {
    return !this.disposed && this.active === session && !session.controller.signal.aborted
      && !terminal.has(session.state.phase)
  }

  private clearKey(session: SetupSession): void {
    session.key?.fill(0)
    session.key = undefined
  }

  private finish(session: SetupSession, phase: QQSetupState['phase'], message: string, appId?: string): void {
    session.state = { id: session.state.id, phase, message, ...(appId ? { appId } : {}) }
    session.stopDeadline()
    session.controller.abort()
    this.clearKey(session)
  }

  private async run(session: SetupSession): Promise<void> {
    try {
      const entry = this.ctx.plugins.list().find(plugin => plugin.name === 'builtin:qq-official')
      if (!entry) throw new QQSetupError('没有找到官方机器人配置，请稍后重试')
      const description = await this.ctx.plugins.describe(entry.id)
      if (!this.live(session)) return
      if (!record(description.effective)) throw new QQSetupError('读取官方机器人配置失败，请重试')
      const effective = structuredClone(description.effective)
      if (Date.now() >= session.deadline) {
        this.finish(session, 'expired', '本次扫码已超时，请重新获取二维码')
        return
      }
      session.key = randomBytes(32)
      const task = await this.request(session, 'create_bind_task', { key: session.key.toString('base64') })
      if (!this.live(session)) return
      const taskId = task.task_id
      if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(taskId)) {
        throw new QQSetupError('腾讯返回的扫码任务无效，请重新获取二维码')
      }
      const url = `https://q.qq.com/qqbot/openclaw/connect.html?task_id=${encodeURIComponent(taskId)}&source=luckylillia&_wv=2`
      const qrCode = await QRCode.toDataURL(url, { width: 280, margin: 2, errorCorrectionLevel: 'M' })
      if (!this.live(session)) return
      session.state = { id: session.state.id, phase: 'waiting', url, qrCode }
      const result = await this.poll(session, taskId)
      if (!result || !this.live(session)) return
      const appId = typeof result.bot_appid === 'number' && Number.isSafeInteger(result.bot_appid)
        ? String(result.bot_appid) : result.bot_appid
      if (typeof appId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(appId)) {
        throw new QQSetupError('腾讯返回的机器人 AppID 无效，请重新扫码')
      }
      const secret = this.decrypt(session, result.bot_encrypt_secret)
      this.clearKey(session)
      if (!this.live(session)) return
      session.state = { id: session.state.id, phase: 'saving', appId, message: '正在保存机器人配置' }
      session.stopDeadline()
      try {
        await this.ctx.plugins.updateConfig(entry.id, { ...effective, appId, secret }, description.rev)
      } catch (error) {
        if (error instanceof PluginRevConflictError) throw new QQSetupError('配置已被修改，请重新扫码后再试')
        throw new QQSetupError('保存机器人配置失败，请重试')
      }
      if (this.live(session)) this.finish(session, 'complete', '机器人配置已保存', appId)
    } catch (error) {
      if (!this.live(session)) return
      this.finish(session, 'failed', error instanceof QQSetupError ? error.message : '扫码配置失败，请重试')
    }
  }

  private async poll(session: SetupSession, taskId: string): Promise<Record<string, unknown> | undefined> {
    while (this.live(session)) {
      let data: Record<string, unknown>
      try {
        data = await this.request(session, 'poll_bind_result', { task_id: taskId })
      } catch {
        if (!this.live(session)) return
        session.state = { ...session.state, message: '暂时无法查询扫码结果，正在重试' }
        await this.delay(session)
        continue
      }
      if (!this.live(session)) return
      if (data.status === 2) return data
      if (data.status === 3) {
        this.finish(session, 'expired', '二维码已过期，请重新获取二维码')
        return
      }
      if (data.status !== 0 && data.status !== 1) throw new QQSetupError('腾讯返回了未知的扫码状态，请重新扫码')
      delete session.state.message
      await this.delay(session)
    }
  }

  private async request(session: SetupSession, action: string, body: object): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const stop = this.ctx.timer.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    const signal = AbortSignal.any([session.controller.signal, controller.signal])
    signal.addEventListener('abort', stop, { once: true })
    try {
      const response = await this.ctx.http.fetch(`${API}${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal,
        redirect: 'error',
      })
      if (signal.aborted) {
        await response.body?.cancel()
        signal.throwIfAborted()
      }
      if (response.status !== 200) {
        await response.body?.cancel()
        throw new QQSetupError('腾讯扫码服务暂不可用，请稍后重试')
      }
      const value: unknown = await response.json()
      signal.throwIfAborted()
      if (!record(value) || value.retcode !== 0 || !record(value.data)) {
        throw new QQSetupError('腾讯扫码服务未能完成请求，请稍后重试')
      }
      return value.data
    } finally {
      stop()
      signal.removeEventListener('abort', stop)
    }
  }

  private decrypt(session: SetupSession, encrypted: unknown): string {
    if (!session.key || typeof encrypted !== 'string' || encrypted.length > 4096
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encrypted)) {
      throw new QQSetupError('腾讯返回的机器人凭据无效，请重新扫码')
    }
    const bytes = Buffer.from(encrypted, 'base64')
    if (bytes.length <= 28) throw new QQSetupError('腾讯返回的机器人凭据无效，请重新扫码')
    const decipher = createDecipheriv('aes-256-gcm', session.key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(-16))
    let plaintext: Buffer | undefined
    try {
      plaintext = Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()])
      const secret = plaintext.toString('utf8')
      if (!/^[\x21-\x7e]{1,256}$/.test(secret)) throw new Error('invalid secret')
      return secret
    } catch {
      throw new QQSetupError('无法读取扫码凭据，请重新扫码')
    } finally {
      plaintext?.fill(0)
      bytes.fill(0)
    }
  }

  private delay(session: SetupSession): Promise<void> {
    if (!this.live(session)) return Promise.resolve()
    return new Promise(resolve => {
      const signal = session.controller.signal
      const done = () => {
        stop()
        signal.removeEventListener('abort', done)
        resolve()
      }
      const stop = this.ctx.timer.setTimeout(done, POLL_INTERVAL)
      signal.addEventListener('abort', done, { once: true })
    })
  }
}
