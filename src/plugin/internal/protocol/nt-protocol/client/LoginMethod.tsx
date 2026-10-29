import React, { useState } from 'react'
import { Cpu, Loader2, MonitorSmartphone, Save } from 'lucide-react'
import { usePluginConfig, usePluginContext } from '@luckylillia/plugin-sdk/webui'
import type { NTProtocolConfig } from '../../../../../common/types'
import {
  describeMethod, effectiveMethod, isEditable, LOGIN_MODES, pendingProtocol, pinnedBy, pinNote, protocolLabel, PROTOCOLS,
  ProtocolId, ProtocolPins,
} from './loginOptions'

const ICONS = { direct: Cpu, pmhq: MonitorSmartphone }

interface LoginMethodProps {
  pins: ProtocolPins
  lockedProtocol?: ProtocolId
  /** Switching the mode logs this account out */
  online: boolean
  onSaved: (modeChanged: boolean) => void
}

/** The login method of builtin:nt-protocol: which one, and the form to change it. */
const LoginMethod: React.FC<LoginMethodProps> = ({ pins, lockedProtocol, online, onSaved }) => {
  const { toast: showToast } = usePluginContext()
  const { value, save, saving, error } = usePluginConfig<NTProtocolConfig>()
  // The saved settings while editing: what the launch fixes is shown in place, but not saved over them
  const [draft, setDraft] = useState<NTProtocolConfig | null>(null)

  if (error) return <p className="mb-6 text-sm text-red-500">读取登录方式失败：{error}</p>
  if (!value) return null
  const current = effectiveMethod(value, pins)

  if (!draft) {
    const note = pinNote(current, pins)
    const pending = pendingProtocol(current, lockedProtocol)
    // What runs now; a protocol saved since then gets the note below
    const running = pending ? { ...current, protocol: lockedProtocol! } : current
    return (
      <div className="flex items-center gap-3 p-4 mb-6 bg-theme-item rounded-xl">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-theme-muted">登录方式</div>
          <div className="text-sm font-medium text-theme mt-0.5">{describeMethod(running)}</div>
          {note && <div className="text-xs text-theme-muted mt-1">{note}</div>}
          {pending && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">已改为 {protocolLabel(pending)}，重启 LLBot 后生效</div>
          )}
        </div>
        {isEditable(current, pins) && (
          <button onClick={() => setDraft(value)} className="btn-glass px-4 py-1.5 text-sm flex-shrink-0">更改</button>
        )}
      </div>
    )
  }

  const shown = effectiveMethod(draft, pins)
  const protocol = PROTOCOLS.find(item => item.id === shown.protocol)
  const waits = pendingProtocol(shown, lockedProtocol)
  const change = (patch: Partial<NTProtocolConfig>) => setDraft({ ...draft, ...patch })
  const changePmhq = (patch: Partial<NTProtocolConfig['pmhq']>) => change({ pmhq: { ...draft.pmhq, ...patch } })

  const submit = async () => {
    if (shown.mode === 'pmhq' && !pins.pmhq) {
      if (!draft.pmhq.host.trim()) return showToast('请填写 PMHQ 地址', 'error')
      const { port } = draft.pmhq
      if (!Number.isInteger(port) || port < 1 || port > 65535) return showToast('PMHQ 端口要在 1 到 65535 之间', 'error')
    }
    const modeChanged = shown.mode !== current.mode
    if (await save(draft, { message: '登录方式已保存' })) {
      setDraft(null)
      onSaved(modeChanged)
    }
  }

  return (
    <div className="p-4 mb-6 border border-theme-divider rounded-xl space-y-4">
      <div className="text-sm font-medium text-theme">登录方式</div>
      <div role="radiogroup" className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {LOGIN_MODES.map((mode) => {
          const selected = shown.mode === mode.id
          const Icon = ICONS[mode.id]
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!!pins.mode}
              onClick={() => change({ mode: mode.id })}
              className={`text-left p-4 rounded-xl border-2 transition-all disabled:cursor-not-allowed ${selected
                ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                : 'border-theme-divider hover:border-theme-muted hover:bg-theme-item disabled:opacity-50 disabled:hover:bg-transparent'}`}
            >
              <div className={`flex items-center gap-2 text-sm font-medium ${selected ? 'text-pink-500' : 'text-theme'}`}>
                <Icon size={18} className={selected ? 'text-pink-500' : 'text-theme-muted'} />
                {mode.label}
              </div>
              <p className="text-xs text-theme-secondary mt-1.5">{mode.hint}</p>
            </button>
          )
        })}
      </div>
      {pins.mode && <p className="text-xs text-theme-muted">登录方式{pinnedBy(pins.mode.by)}</p>}

      {shown.mode === 'direct' ? (
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">模拟的 QQ 客户端</label>
          <select
            value={shown.protocol}
            disabled={!!pins.protocol}
            onChange={e => change({ protocol: e.target.value as ProtocolId })}
            className="input-field"
          >
            {PROTOCOLS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <p className="text-xs text-theme-muted mt-1">
            {pins.protocol ? pinnedBy(pins.protocol.by) : '不同客户端的登录记录分开保存，换了以后要重新登录'}
          </p>
          {protocol?.hint && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{protocol.hint}</p>}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-theme-secondary mb-2">PMHQ 地址</label>
              <input
                value={shown.pmhq.host}
                disabled={!!pins.pmhq}
                onChange={e => changePmhq({ host: e.target.value })}
                placeholder="127.0.0.1"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-2">端口</label>
              <input
                type="number"
                value={Number.isNaN(shown.pmhq.port) ? '' : shown.pmhq.port}
                disabled={!!pins.pmhq}
                onChange={e => changePmhq({ port: e.target.valueAsNumber })}
                min="1"
                max="65535"
                placeholder="13000"
                className="input-field"
              />
            </div>
          </div>
          <p className="text-xs text-theme-muted mt-1">
            {pins.pmhq ? pinnedBy(pins.pmhq.by) : '先启动官方 QQ 客户端和 PMHQ，再在 QQ 客户端里登录账号'}
          </p>
        </div>
      )}

      {online && shown.mode !== current.mode && (
        <p className="text-sm text-amber-600 dark:text-amber-400">保存后会断开当前登录的 QQ 账号，改用{LOGIN_MODES.find(mode => mode.id === shown.mode)!.label}</p>
      )}
      {waits && lockedProtocol && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          这次运行的纯协议已经在用 {protocolLabel(lockedProtocol)}，改成 {protocolLabel(waits)} 要重启 LLBot 后才生效
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setDraft(null)}
          disabled={saving}
          className="px-4 py-2 bg-theme-item hover:bg-theme-item-hover text-theme rounded-xl transition-colors font-medium"
        >
          取消
        </button>
        <button onClick={submit} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  )
}

export default LoginMethod
