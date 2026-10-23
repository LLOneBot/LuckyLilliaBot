import React, { useState } from 'react'
import { Cpu, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react'
import { HostSelector, showToast } from '../common'
import type { SatoriConfig as SatoriSettings } from '../../types'
import { SaveButton } from './SaveButton'
import { useBuiltinConfig } from './useBuiltinConfig'

const SatoriConfig: React.FC = () => {
  const { value: satori, setValue, save, saving, error } = useBuiltinConfig<SatoriSettings>('builtin:satori')
  const [showSatoriToken, setShowSatoriToken] = useState(false)

  if (error) return <p className="card p-6 text-sm text-red-500">加载 Satori 配置失败：{error}</p>
  if (!satori) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  const change = (patch: Partial<SatoriSettings>) => setValue({ ...satori, ...patch })

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center">
          <Cpu size={24} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-theme">Satori 协议</h3>
          <p className="text-sm text-theme-secondary">配置 Satori 协议相关设置</p>
        </div>
        <div className="flex-1" />
        <a
          href="https://www.luckylillia.com/guide/develop#satori-%E5%8D%8F%E8%AE%AE"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors"
        >
          <ExternalLink size={16} />
          文档
        </a>
      </div>

      <div className="space-y-4">
        {/* 启用开关统一由插件页的卡片控制，这里只配置参数 */}
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            监听地址
          </label>
          <HostSelector
            value={satori.host}
            onChange={(host) => change({ host })}
          />
          <p className="text-xs text-theme-muted mt-1">选择服务监听的网络地址</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            Satori 端口
          </label>
          <input
            type="number"
            value={satori.port}
            onChange={(e) => change({ port: parseInt(e.target.value) })}
            min="1"
            max="65535"
            placeholder="5500"
            className="input-field"
          />
          <p className="text-xs text-theme-muted mt-1">Satori 服务监听端口（1-65535）</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-secondary mb-2">
            Satori Token
          </label>
          <div className="relative">
            <input
              type={showSatoriToken ? 'text' : 'password'}
              value={satori.token}
              onChange={(e) => change({ token: e.target.value })}
              placeholder="请输入 Satori Token"
              className="input-field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowSatoriToken(!showSatoriToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors p-1"
            >
              {showSatoriToken ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-xs text-theme-muted mt-1">用于 Satori 连接验证的 Token</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <SaveButton
          saving={saving}
          onClick={() => {
            // 检查：如果监听所有地址且 satori 启用，token 必须设置
            // Immediate feedback; the server runs the same rule
            if (satori.host === '' && satori.enable && !satori.token?.trim()) {
              showToast('当监听所有地址时，必须设置 Satori Token！', 'error')
              return
            }
            save(satori)
          }}
        />
      </div>
    </div>
  )
}

export default SatoriConfig
