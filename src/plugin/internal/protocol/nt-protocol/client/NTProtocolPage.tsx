import React, { useEffect, useRef, useState } from 'react'
import { Loader2, Power, Smartphone } from 'lucide-react'
import { usePluginConfig, usePluginContext, usePluginStatus } from '@luckylillia/plugin-sdk/webui'
import type { NTProtocolConfig } from '../../../../../common/types'
import AuthTokenCard from './AuthTokenCard'
import AuthTokenForm, { type AuthTokenStatus } from './AuthTokenForm'
import LaunchQQ from './LaunchQQ'
import ProtocolSettings from './ProtocolSettings'
import LoginMethod from './LoginMethod'
import QQLogin from './QQLogin'
import { LOGIN_MODES, type BridgeStatus, type LoginMode, type ProtocolId, type ProtocolPins } from './loginOptions'

interface LoginInfo {
  online: boolean
  uin: string
  nick: string
  mode: LoginMode
  /** The protocol service is up, and with it the login routes. */
  ntProtocol: boolean
  lockedProtocol?: ProtocolId
  pins: ProtocolPins
  /** Only for the bridge */
  nativeQQ?: { configPath: string; qqPath: string; connected: boolean; status?: BridgeStatus }
}

const POLL_INTERVAL = 3000
// While the bridge starts QQ or waits for its login identity
const QUICK_POLL_INTERVAL = 1000

/** Settings page of builtin:nt-protocol, where the scanned account logs in and out. */
const NTProtocolPage: React.FC = () => {
  const ctx = usePluginContext()
  const entry = usePluginStatus()
  const config = usePluginConfig<NTProtocolConfig>()
  const disabled = entry?.disabled ?? false
  const [info, setInfo] = useState<LoginInfo | null>(null)
  // The pure protocol keeps its last account while reconnecting; the bridge goes back to its login flow.
  const [known, setKnown] = useState<{ uin: string; nick: string } | null>(null)
  // Online at the last poll; undefined before the first
  const wasOnline = useRef<boolean | undefined>(undefined)
  const [tokenStatus, setTokenStatus] = useState<AuthTokenStatus | null>(null)
  // Sticky, so that the form stays while the token it submitted is being checked
  const [tokenForm, setTokenForm] = useState<'missing' | 'invalid' | null>(null)
  // Only the pure protocol keeps an offline card until asked, so reconnecting does not trigger QR login.
  const [relogin, setRelogin] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  // Picked in the login method editor, not saved yet: the login below belongs to the method that runs
  const [draftMode, setDraftMode] = useState<LoginMode | null>(null)
  // Polls right away, e.g. once a quick login went through
  const pollNow = useRef<() => void>(() => {})

  // login-info is there with the protocol off too, and says what the launch fixes about the login method
  useEffect(() => {
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (running) return
      running = true
      clearTimeout(timer)
      const [login, token] = await Promise.allSettled([
        ctx.api<LoginInfo>('/api/login-info'),
        // Mounted with the protocol
        disabled ? Promise.resolve(null) : ctx.api<AuthTokenStatus>('/api/auth-token/status'),
      ])
      if (stopped) return
      if (login.status === 'fulfilled') setInfo(login.value)
      const bridge = login.status === 'fulfilled' && login.value.mode === 'nativeqq' ? login.value.nativeQQ?.status : undefined
      // Before the bridge's session runs it has no token watcher, and the token status means nothing
      const bridgeIdle = login.status === 'fulfilled' && login.value.mode === 'nativeqq' && bridge?.session !== 'running'
      if (token.status === 'fulfilled' && token.value) {
        const status = token.value
        setTokenStatus(status)
        if (bridgeIdle) {
          setTokenForm(null)
        } else if (status.applicable && (!status.hasToken || status.validation === 'invalid')) {
          setTokenForm(status.validation === 'invalid' ? 'invalid' : 'missing')
        } else if (!status.applicable || status.validation === 'valid') {
          setTokenForm(null)
        }
      }
      running = false
      const comingUp = bridge && (bridge.session === 'starting' || (bridge.session === 'running' &&
        (!bridge.qqRunning || (login.status === 'fulfilled' && !login.value.online))))
      timer = setTimeout(poll, comingUp ? QUICK_POLL_INTERVAL : POLL_INTERVAL)
    }
    pollNow.current = () => void poll()
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
      pollNow.current = () => {}
    }
  }, [disabled])

  // The rest of the WebUI follows the accounts on its own (/api/bots), so a login needs no reload
  useEffect(() => {
    if (!info) return
    if (info.online) {
      if (wasOnline.current === false) ctx.toast('QQ 登录成功')
      setKnown({ uin: info.uin, nick: info.nick })
      setRelogin(false)
    }
    wasOnline.current = info.online
  }, [info, ctx])

  const logout = async () => {
    setLoggingOut(true)
    try {
      await ctx.api('/api/logout', { method: 'POST' })
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : '退出登录失败', 'error')
      setLoggingOut(false)
      return
    }
    window.location.reload()
  }

  const setAutoLogin = async (enabled: boolean) => {
    if (!info?.online || !info.uin || !config.value || config.saving) return
    await config.save({ ...config.value, autoLoginUin: enabled ? info.uin : '' }, {
      message: enabled ? '已开启自动登录' : '已关闭自动登录',
    })
  }

  const loginError = tokenStatus?.loginError || (tokenStatus?.validation === 'error' ? tokenStatus.message : '')
  const waiting = (text: string) => (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-theme-secondary">
      <Loader2 size={18} className="animate-spin text-pink-500" />
      {text}
    </div>
  )

  const account = info?.online ? { uin: info.uin, nick: info.nick } : known
  const bridge = info?.mode === 'nativeqq' ? info.nativeQQ?.status : undefined
  // Without a session nothing reconnects the bridge's account: the page offers to start QQ instead of its card
  const bridgeDown = info?.mode === 'nativeqq' && (bridge ? bridge.session !== 'running' : !info.nativeQQ?.connected)
  let body: React.ReactNode
  // The login waits on the token: the form takes the whole page then
  let tokenFormShown = false
  if (disabled) {
    body = <p className="text-sm text-theme-secondary">启用后在这里快速登录或扫码登录 QQ 账号</p>
  } else if (!info) {
    body = waiting('正在读取登录状态...')
  } else if (!info.ntProtocol) {
    body = entry?.state === 'failed'
      ? <p className="text-sm text-theme-secondary">NTQQ 协议没能启动，原因见上方提示</p>
      : waiting('NTQQ 协议正在启动...')
  } else if (draftMode && draftMode !== info.mode) {
    body = (
      <p className="py-10 text-center text-sm text-theme-secondary">
        保存后改用{LOGIN_MODES.find(mode => mode.id === draftMode)?.label}登录
      </p>
    )
  } else if (account && (info.online || (info.mode === 'direct' && !relogin))) {
    body = (
      <>
        <div className="flex items-center gap-4 p-4 bg-theme-item rounded-xl">
          <img
            src={`https://thirdqq.qlogo.cn/g?b=qq&nk=${account.uin}&s=140`}
            alt="头像"
            className="w-14 h-14 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium text-theme truncate">{account.nick || account.uin}</div>
            <div className="text-sm text-theme-muted">{account.uin}</div>
          </div>
          <span className={`text-xs font-medium px-3 py-1 rounded-full flex-shrink-0 ${info.online
            ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400'
            : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'}`}
          >
            {info.online ? '在线' : '离线'}
          </span>
        </div>

        {info.online && (
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={config.value?.autoLoginUin === account.uin}
              disabled={!config.value || config.saving || !!config.error}
              onChange={event => void setAutoLogin(event.target.checked)}
              className="mt-0.5 w-4 h-4 accent-pink-500 disabled:opacity-50"
            />
            <span>
              <span className="flex items-center gap-2 text-sm text-theme">
                自动登录
                {config.saving && <Loader2 size={14} className="animate-spin text-pink-500" />}
              </span>
              <span className="block mt-1 text-xs text-theme-muted">启动此实例时自动登录 QQ {account.uin}</span>
            </span>
          </label>
        )}

        {!info.online && (
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className={`flex-1 ${loginError ? 'text-red-500' : 'text-theme-secondary'}`}>{loginError || '连接断开了，正在自动重连'}</span>
            <button onClick={() => setRelogin(true)} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">重新登录</button>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          {info.mode === 'nativeqq' ? (
            <p className="text-xs text-theme-muted">官方 QQ 客户端桥接的账号在 QQ 客户端里登录和退出</p>
          ) : confirmLogout ? (
            <>
              <span className="flex-1 text-sm text-theme-secondary">确定要退出当前 QQ 登录吗？退出后可重新选择账号快速登录或扫码登录。</span>
              <button
                onClick={() => setConfirmLogout(false)}
                disabled={loggingOut}
                className="px-4 py-2 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={logout}
                disabled={loggingOut}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium flex items-center gap-2 disabled:opacity-60"
              >
                {loggingOut && <Loader2 size={16} className="animate-spin" />}
                确认退出
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmLogout(true)}
              className="flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium"
            >
              <Power size={18} />
              退出登录
            </button>
          )}
        </div>
      </>
    )
  } else if (bridgeDown) {
    body = bridge && (bridge.session === 'starting' || bridge.session === 'stopping')
      ? waiting(bridge.session === 'starting' ? '正在启动 QQ...' : '正在停止 QQ...')
      : <LaunchQQ target={info.nativeQQ} failure={bridge?.failure || loginError} onLaunched={() => pollNow.current()} />
  } else if (tokenForm) {
    tokenFormShown = true
    body = (
      <div className="py-4">
        <AuthTokenForm reason={tokenForm} authTokenPageUrl={tokenStatus?.authTokenPageUrl} onSuccess={() => setTokenForm(null)} />
      </div>
    )
  } else if (bridge && !bridge.qqRunning) {
    // The session runs and the token is in: QQ itself is on its way
    body = waiting('正在启动 QQ...')
  } else if (bridge?.loggedIn) {
    // Native health may observe login before the protocol's next identity poll. Do not offer another login.
    body = waiting('QQ 已登录，正在同步账号状态...')
  } else {
    body = (
      <div className="py-4">
        {loginError && (
          <div className="max-w-md mx-auto mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
            {loginError}
          </div>
        )}
        <QQLogin onLogin={() => pollNow.current()} />
      </div>
    )
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center flex-shrink-0">
          <Smartphone size={24} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-theme">NTQQ 协议</h3>
          <p className="text-sm text-theme-secondary">扫码登录的 QQ 账号，OneBot、Satori、Milky 和 WebQQ 都通过它收发消息</p>
        </div>
        <ProtocolSettings />
      </div>
      {info && (
        <LoginMethod
          config={config}
          pins={info.pins}
          lockedProtocol={info.lockedProtocol}
          online={info.online}
          // The account goes with the old mode: show the new mode's login rather than its card offline
          onSaved={(modeChanged) => {
            if (modeChanged) setRelogin(true)
            pollNow.current()
          }}
          onDraftMode={setDraftMode}
        />
      )}
      {/* The bridge needs a token too, read once its QQ is up */}
      {!disabled && info?.ntProtocol && (info.mode === 'direct' || bridge?.session === 'running') && tokenStatus && !tokenFormShown && (
        <AuthTokenCard status={tokenStatus} onChanged={() => pollNow.current()} />
      )}
      {body}
    </div>
  )
}

export default NTProtocolPage
