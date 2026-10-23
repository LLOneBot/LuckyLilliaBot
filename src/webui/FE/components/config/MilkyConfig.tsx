import React, { useState } from 'react'
import { ExternalLink, Eye, EyeOff, Loader2, Milk, Plus, Trash2 } from 'lucide-react'
import { HostSelector, showToast } from '../common'
import type { MilkyConfig as MilkySettings } from '../../types'
import { SaveButton } from './SaveButton'
import { useBuiltinConfig } from './useBuiltinConfig'

const MilkyConfig: React.FC = () => {
  const { value: milky, setValue, save, saving, error } = useBuiltinConfig<MilkySettings>('builtin:milky')
  const [showMilkyToken, setShowMilkyToken] = useState(false)
  const [showMilkyWebhookToken, setShowMilkyWebhookToken] = useState(false)

  if (error) return <p className="card p-6 text-sm text-red-500">加载 Milky 配置失败：{error}</p>
  if (!milky) return <div className="flex justify-center py-16"><Loader2 size={40} className="animate-spin text-pink-500" /></div>
  // The page edits `config.milky`; keep that shape and hand only the Milky section around
  const config = { milky }
  const setConfig = (next: { milky: MilkySettings }) => setValue(next.milky)

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
          <Milk size={24} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-theme">Milky 协议</h3>
          <p className="text-sm text-theme-secondary">配置 Milky 协议相关设置</p>
        </div>
        <div className="flex-1" />
        <a
          href="https://www.luckylillia.com/guide/develop#milky-%E5%8D%8F%E8%AE%AE"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors"
        >
          <ExternalLink size={16} />
          文档
        </a>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl hover:bg-theme-item-hover transition-colors">
          <div>
            <div className="text-sm font-medium text-theme">启用 Milky 协议</div>
            <div className="text-xs text-theme-muted mt-0.5">开启后将支持 Milky 协议连接</div>
          </div>
          <input
            type="checkbox"
            checked={config.milky.enable}
            onChange={(e) => setConfig({
              ...config,
              milky: { ...config.milky, enable: e.target.checked }
            })}
            className="switch-toggle"
          />
        </div>

        {config.milky.enable && (
          <>
            <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl hover:bg-theme-item-hover transition-colors">
              <div>
                <div className="text-sm font-medium text-theme">上报自己发送的消息</div>
                <div className="text-xs text-theme-muted mt-0.5">启用后将上报自己发送的消息</div>
              </div>
              <input
                type="checkbox"
                checked={config.milky.reportSelfMessage}
                onChange={(e) => setConfig({
                  ...config,
                  milky: { ...config.milky, reportSelfMessage: e.target.checked }
                })}
                className="switch-toggle"
              />
            </div>

            {/* HTTP 配置 */}
            <div className="border-t border-theme-divider pt-4 mt-4">
              <h4 className="text-md font-semibold text-theme mb-4">HTTP 配置</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    监听地址
                  </label>
                  <HostSelector
                    value={config.milky.http.host}
                    onChange={(host) => setConfig({
                      ...config,
                      milky: {
                        ...config.milky,
                        http: { ...config.milky.http, host }
                      }
                    })}
                  />
                  <p className="text-xs text-theme-muted mt-1">选择服务监听的网络地址</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    HTTP 端口
                  </label>
                  <input
                    type="number"
                    value={config.milky.http.port}
                    onChange={(e) => setConfig({
                      ...config,
                      milky: {
                        ...config.milky,
                        http: { ...config.milky.http, port: parseInt(e.target.value) }
                      }
                    })}
                    min="1"
                    max="65535"
                    placeholder="3010"
                    className="input-field"
                  />
                  <p className="text-xs text-theme-muted mt-1">Milky HTTP 服务监听端口（1-65535）</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    路径前缀
                  </label>
                  <input
                    type="text"
                    value={config.milky.http.prefix}
                    onChange={(e) => setConfig({
                      ...config,
                      milky: {
                        ...config.milky,
                        http: { ...config.milky.http, prefix: e.target.value }
                      }
                    })}
                    placeholder="/api"
                    className="input-field"
                  />
                  <p className="text-xs text-theme-muted mt-1">HTTP API 路径前缀（可选）</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-2">
                    Access Token
                  </label>
                  <div className="relative">
                    <input
                      type={showMilkyToken ? 'text' : 'password'}
                      value={config.milky.http.accessToken}
                      onChange={(e) => setConfig({
                        ...config,
                        milky: {
                          ...config.milky,
                          http: { ...config.milky.http, accessToken: e.target.value }
                        }
                      })}
                      placeholder="请输入 Access Token"
                      className="input-field pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMilkyToken(!showMilkyToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors p-1"
                    >
                      {showMilkyToken ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-theme-muted mt-1">用于 Milky HTTP 连接验证的 Token</p>
                </div>
              </div>
            </div>

            {/* Webhook 配置 */}
            <div className="border-t border-theme-divider pt-4 mt-4">
              <h4 className="text-md font-semibold text-theme mb-4">Webhook 配置</h4>
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-2">
                  Webhook URLs
                </label>
                <div className="space-y-2">
                  {config.milky.webhook.urls.map((url, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...config.milky.webhook.urls]
                          newUrls[index] = e.target.value
                          setConfig({
                            ...config,
                            milky: {
                              ...config.milky,
                              webhook: { ...config.milky.webhook, urls: newUrls }
                            }
                          })
                        }}
                        placeholder="http:// 或 https://"
                        className={`input-field flex-1 ${
                          url && !url.match(/^https?:\/\//) ? 'border-red-300 focus:ring-red-500' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newUrls = config.milky.webhook.urls.filter((_, i) => i !== index)
                          setConfig({
                            ...config,
                            milky: {
                              ...config.milky,
                              webhook: { ...config.milky.webhook, urls: newUrls }
                            }
                          })
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {config.milky.webhook.urls.some(url => url && !url.match(/^https?:\/\//)) && (
                    <p className="text-xs text-red-500">URL 必须以 http:// 或 https:// 开头</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setConfig({
                        ...config,
                        milky: {
                          ...config.milky,
                          webhook: {
                            ...config.milky.webhook,
                            urls: [...config.milky.webhook.urls, '']
                          }
                        }
                      })
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors text-sm font-medium"
                  >
                    <Plus size={18} />
                    添加 Webhook URL
                  </button>
                </div>
                <p className="text-xs text-theme-muted mt-2">事件上报的 Webhook 地址</p>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-theme-secondary mb-2">
                  Access Token
                </label>
                <div className="relative">
                  <input
                    type={showMilkyWebhookToken ? 'text' : 'password'}
                    value={config.milky.webhook.accessToken}
                    onChange={(e) => setConfig({
                      ...config,
                      milky: {
                        ...config.milky,
                        webhook: { ...config.milky.webhook, accessToken: e.target.value }
                      }
                    })}
                    placeholder="请输入 Access Token"
                    className="input-field pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMilkyWebhookToken(!showMilkyWebhookToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors p-1"
                  >
                    {showMilkyWebhookToken ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-xs text-theme-muted mt-1">用于 Webhook 请求验证的 Token</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <SaveButton
          saving={saving}
          onClick={() => {
            // 检查：如果监听所有地址且 milky 启用，accessToken 必须设置
            if (config.milky.http.host === '' && config.milky.enable && !config.milky.http.accessToken?.trim()) {
              showToast('当监听所有地址时，必须设置 Milky Access Token！', 'error')
              return
            }
            // 检查 Webhook URL 格式
            const invalidUrls = config.milky.webhook.urls.filter(url => url.trim() && !url.match(/^https?:\/\//))
            if (invalidUrls.length > 0) {
              showToast('Webhook URL 必须以 http:// 或 https:// 开头', 'error')
              return
            }
            // 过滤掉空的 URL
            const cleanedConfig = {
              ...config,
              milky: {
                ...config.milky,
                webhook: {
                  ...config.milky.webhook,
                  urls: config.milky.webhook.urls.filter(url => url.trim())
                }
              }
            }
            setConfig(cleanedConfig)
            save(cleanedConfig.milky)
          }}
        />
      </div>
    </div>
  )
}

export default MilkyConfig
