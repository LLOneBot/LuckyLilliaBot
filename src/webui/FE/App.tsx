import React, { useState, useEffect, useCallback } from 'react';
import {
  Sidebar,
  Dashboard,
  LogViewer,
  OneBotConfigNew,
  OtherConfig,
  TokenDialog,
  ChangePasswordDialog,
  QQLogin,
  ToastContainer,
  showToast,
  AnimatedBackground,
  HostSelector,
} from './components';
import { WebQQPage, WebQQFullscreen } from './components/WebQQ';
import { Config, ResConfig, EmailConfig } from './types';
import { apiFetch, setPasswordPromptHandler } from './utils/api';
import { Save, Loader2, Eye, EyeOff, Plus, Trash2, Menu, Cpu, Milk } from 'lucide-react';
import { defaultConfig } from '../../common/defaultConfig'
import { version } from '../../version'
import SettingsDialog from './components/common/SettingsDialog'
import { useSettingsStore } from './stores/settingsStore'


function App() {
  // 从 URL hash 读取初始 tab，默认 dashboard
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1) // 去掉 #
    const validTabs = ['dashboard', 'onebot', 'satori', 'milky', 'logs', 'other', 'webqq', 'webqq-fullscreen', 'about']
    return validTabs.includes(hash) ? hash : 'dashboard'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);

  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [accountInfo, setAccountInfo] = useState<{ nick: string; uin: string } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordResolve, setPasswordResolve] = useState<((value: string) => void) | null>(null);
  const [showSatoriToken, setShowSatoriToken] = useState(false);
  const [showMilkyToken, setShowMilkyToken] = useState(false);
  const [showMilkyWebhookToken, setShowMilkyWebhookToken] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [qqVersion, setQqVersion] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const { autoHideSidebarInWebQQ } = useSettingsStore();

  // 设置密码提示处理器
  useEffect(() => {
    setPasswordPromptHandler(async (tip: string) => {
      return new Promise<string>((resolve) => {
        setPasswordError(tip || '');
        setShowPasswordDialog(true);
        setPasswordResolve(() => resolve);
      });
    });
  }, []);

  // 同步 tab 和 URL hash
  useEffect(() => {
    window.location.hash = activeTab
  }, [activeTab])

  // WebQQ 自动隐藏侧边栏
  useEffect(() => {
    if (autoHideSidebarInWebQQ && activeTab === 'webqq') {
      setSidebarCollapsed(true)
    }
  }, [activeTab, autoHideSidebarInWebQQ])

  // 监听浏览器前进/后退
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const validTabs = ['dashboard', 'onebot', 'satori', 'milky', 'logs', 'other', 'webqq', 'webqq-fullscreen', 'about']
      if (validTabs.includes(hash)) {
        setActiveTab(hash)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 处理密码确认
  const handlePasswordConfirm = useCallback((password: string) => {
    if (password.trim()) {
      setShowPasswordDialog(false);
      setPasswordError('');
      if (passwordResolve) {
        passwordResolve(password);
        setPasswordResolve(null);
      }
    } else {
      setPasswordError('密码不能为空');
    }
  }, [passwordResolve]);

  // 检查登录状态
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await apiFetch<ResConfig>('/api/config');
        if (response.success && response.data.selfInfo.online) {
          setIsLoggedIn(true);
          setAccountInfo({
            nick: response.data.selfInfo.nick || '',
            uin: response.data.selfInfo.uin,
          });
          
          // 获取主配置
          setConfig(response.data.config);
          
          // 获取邮件配置（独立管理）
          try {
            const emailResponse = await apiFetch<EmailConfig>('/api/email/config');
            if (emailResponse.success && emailResponse.data) {
              setEmailConfig(emailResponse.data);
            }
          } catch (e) {
            console.error('Failed to fetch email config:', e);
          }
          
          // 获取 QQ 版本号（单独 try-catch，不影响登录状态）
          try {
            const deviceInfoRes = await apiFetch<{ devType: string; buildVer: string }>('/api/device-info');
            if (deviceInfoRes.success && deviceInfoRes.data?.buildVer) {
              setQqVersion(deviceInfoRes.data.buildVer);
            }
          } catch (e) {
            console.error('Failed to fetch device info:', e);
          }
        } else {
          setIsLoggedIn(false);
        }
      } catch (error) {
        console.error('Failed to check login status:', error);
        setIsLoggedIn(false);
      } finally {
        setCheckingLogin(false);
      }
    };
    checkLoginStatus();
  }, []);

  // 保存配置
  const handleSave = useCallback(async (configToSave?: Config, emailConfigToSave?: EmailConfig | null) => {
    try {
      setLoading(true);
      const finalConfig = configToSave || config;
      const finalEmailConfig = emailConfigToSave !== undefined ? emailConfigToSave : emailConfig;
      
      // 保存主配置
      const response = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: finalConfig }),
      });
      
      if (!response.success) {
        showToast(response.message || '保存失败', 'error');
        return;
      }
      
      // 保存邮件配置（如果有）
      if (finalEmailConfig) {
        try {
          const emailResponse = await apiFetch('/api/email/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalEmailConfig),
          });
          
          if (!emailResponse.success) {
            showToast(`主配置已保存，但邮件配置保存失败：${emailResponse.message}`, 'warning');
            return;
          }
        } catch (emailError: any) {
          showToast(`主配置已保存，但邮件配置保存失败：${emailError.message}`, 'warning');
          return;
        }
      }
      
      showToast('配置保存成功', 'success');
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [config, emailConfig]);

  // 登录成功回调
  const handleLoginSuccess = useCallback(() => {
    window.location.reload();
  }, []);

  // 加载中
  if (checkingLogin) {
    return (
      <>
        {/* Animated Background */}
        <AnimatedBackground />

        <div className="relative flex items-center justify-center min-h-screen z-10">
          <Loader2 size={48} className="animate-spin text-pink-500" />
        </div>

        {/* Password Dialog - 支持加载时的 401 设置密码 */}
        <TokenDialog
          visible={showPasswordDialog}
          onConfirm={handlePasswordConfirm}
          error={passwordError}
        />
      </>
    );
  }

  // 未登录，显示登录页面
  if (!isLoggedIn) {
    return (
      <>
        {/* Animated Background - 为密码弹框提供背景动画 */}
        <AnimatedBackground />

        {/* QQLogin 组件内部已有自己的背景 */}
        <QQLogin onLoginSuccess={handleLoginSuccess} />

        {/* Password Dialog - 支持 401 设置密码 */}
        <TokenDialog
          visible={showPasswordDialog}
          onConfirm={handlePasswordConfirm}
          error={passwordError}
        />

        <ToastContainer />
      </>
    );
  }

  // webqq-fullscreen 路由：独立的全屏页面
  if (activeTab === 'webqq-fullscreen') {
    return (
      <>
        {/* Animated Background */}
        <AnimatedBackground />

        <WebQQFullscreen />

        {/* Password Dialog */}
        <TokenDialog
          visible={showPasswordDialog}
          onConfirm={handlePasswordConfirm}
          error={passwordError}
        />

        {/* Toast Container */}
        <ToastContainer />
      </>
    )
  }

  // 已登录，显示主页面
  return (
    <div className="flex min-h-screen">
      {/* Animated Background */}
      <AnimatedBackground />

      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        accountInfo={accountInfo || undefined}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={() => setShowSettingsDialog(true)}
      />

      <main className={`flex-1 overflow-auto z-10 transition-all duration-300 ${sidebarCollapsed ? '' : 'md:ml-64'}`}>
        {/* 移动端顶部导航栏 */}
        <div className="md:hidden sticky top-0 z-30 bg-theme-card/95 backdrop-blur-xl border-b border-theme-divider px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-theme">LLBot</span>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {/* Header - 桌面端显示 */}
          <div className="mb-8 hidden md:block">
            <h2 className="text-3xl font-bold text-white mb-2">
              {activeTab === 'dashboard' && 'Dashboard'}
            </h2>
            <p className="text-white/80">
              {activeTab === 'dashboard' && '欢迎使用 Lucky Lillia Bot'}
            </p>
          </div>

          {/* Content */}
          {activeTab === 'dashboard' && <Dashboard llbotVersion={version} qqVersion={qqVersion} />}

          {activeTab === 'webqq' && <WebQQPage />}

          {activeTab === 'logs' && <LogViewer />}

          {activeTab === 'onebot' && (
            <OneBotConfigNew
              config={config.ob11}
              onChange={(newOb11Config) => {
                const newConfig = { ...config, ob11: newOb11Config };
                setConfig(newConfig);
              }}
              onSave={(newOb11Config) => {
                if (newOb11Config) {
                  const newConfig = { ...config, ob11: newOb11Config };
                  handleSave(newConfig);
                } else {
                  handleSave();
                }
              }}
            />
          )}

          {activeTab === 'satori' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center">
                  <Cpu size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-theme">Satori 协议</h3>
                  <p className="text-sm text-theme-secondary">配置 Satori 协议相关设置</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-theme-item rounded-xl hover:bg-theme-item-hover transition-colors">
                  <div>
                    <div className="text-sm font-medium text-theme">启用 Satori 协议</div>
                    <div className="text-xs text-theme-muted mt-0.5">开启后将支持 Satori 协议连接</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.satori.enable}
                    onChange={(e) => setConfig({
                      ...config,
                      satori: { ...config.satori, enable: e.target.checked }
                    })}
                    className="switch-toggle"
                  />
                </div>

                {config.satori.enable && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-theme-secondary mb-2">
                        监听地址
                      </label>
                      <HostSelector
                        value={config.satori.host}
                        onChange={(host) => setConfig({
                          ...config,
                          satori: { ...config.satori, host }
                        })}
                      />
                      <p className="text-xs text-theme-muted mt-1">选择服务监听的网络地址</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-theme-secondary mb-2">
                        Satori 端口
                      </label>
                      <input
                        type="number"
                        value={config.satori.port}
                        onChange={(e) => setConfig({
                          ...config,
                          satori: { ...config.satori, port: parseInt(e.target.value) }
                        })}
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
                          value={config.satori.token}
                          onChange={(e) => setConfig({
                            ...config,
                            satori: { ...config.satori, token: e.target.value }
                          })}
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
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button onClick={() => {
                  // 检查：如果监听所有地址且 satori 启用，token 必须设置
                  if (config.satori.host === '' && config.satori.enable && !config.satori.token?.trim()) {
                    showToast('当监听所有地址时，必须设置 Satori Token！', 'error');
                    return;
                  }
                  handleSave();
                }} disabled={loading} className="btn-primary flex items-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      保存配置
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'milky' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                  <Milk size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-theme">Milky 协议</h3>
                  <p className="text-sm text-theme-secondary">配置 Milky 协议相关设置</p>
                </div>
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
                                  const newUrls = [...config.milky.webhook.urls];
                                  newUrls[index] = e.target.value;
                                  setConfig({
                                    ...config,
                                    milky: {
                                      ...config.milky,
                                      webhook: { ...config.milky.webhook, urls: newUrls }
                                    }
                                  });
                                }}
                                placeholder="http:// 或 https://"
                                className={`input-field flex-1 ${
                                  url && !url.match(/^https?:\/\//) ? 'border-red-300 focus:ring-red-500' : ''
                                }`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newUrls = config.milky.webhook.urls.filter((_, i) => i !== index);
                                  setConfig({
                                    ...config,
                                    milky: {
                                      ...config.milky,
                                      webhook: { ...config.milky.webhook, urls: newUrls }
                                    }
                                  });
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
                              });
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
                <button onClick={() => {
                  // 检查：如果监听所有地址且 milky 启用，accessToken 必须设置
                  if (config.milky.http.host === '' && config.milky.enable && !config.milky.http.accessToken?.trim()) {
                    showToast('当监听所有地址时，必须设置 Milky Access Token！', 'error');
                    return;
                  }
                  // 检查 Webhook URL 格式
                  const invalidUrls = config.milky.webhook.urls.filter(url => url.trim() && !url.match(/^https?:\/\//));
                  if (invalidUrls.length > 0) {
                    showToast('Webhook URL 必须以 http:// 或 https:// 开头', 'error');
                    return;
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
                  };
                  setConfig(cleanedConfig);
                  handleSave(cleanedConfig);
                }} disabled={loading} className="btn-primary flex items-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      保存配置
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'other' && (
            <>
              <div className="pb-24">
                <OtherConfig
                  config={config}
                  emailConfig={emailConfig}
                  onChange={setConfig}
                  onEmailChange={setEmailConfig}
                  onOpenChangePassword={() => setShowChangePasswordDialog(true)}
                />
              </div>
              {/* 固定在底部的保存按钮 */}
              <div className="fixed bottom-8 right-8 z-40">
                <button
                  onClick={() => handleSave()}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2 shadow-2xl hover:shadow-3xl"
                >
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      保存配置
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {activeTab === 'about' && (
            <div className="space-y-6">
              {/* 项目信息 */}
              <div className="card p-8 text-center">
                <div className="w-20 h-20 rounded-3xl overflow-hidden mx-auto mb-6 shadow-lg">
                  <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-3xl font-bold text-theme mb-2">Lucky Lillia Bot</h1>
                <p className="text-theme-secondary mb-6">使你的 QQNT 支持 OneBot 11 协议、Satori 协议、Milky 协议进行 QQ 机器人开发</p>
                <div className="flex items-center justify-center gap-4">
                  <a
                    href="https://github.com/LLOneBot/LuckyLilliaBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 bg-gray-800 dark:bg-neutral-700 text-white rounded-xl hover:bg-gray-900 dark:hover:bg-neutral-600 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    GitHub
                  </a>
                  <a
                    href="https://luckylillia.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 gradient-primary text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    文档
                  </a>
                </div>
              </div>

              {/* 社区 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl gradient-primary-br flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 3c-1.862 0-3.505.928-4.5 2.344C11.005 3.928 9.362 3 7.5 3 4.462 3 2 5.462 2 8.5c0 4.171 4.912 8.213 6.281 9.49a2.94 2.94 0 0 0 2.438.94 2.94 2.94 0 0 0 2.438-.94C14.588 16.713 19.5 12.671 19.5 8.5 19.5 5.462 17.038 3 16.5 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-theme">Telegram 群</h3>
                      <p className="text-sm text-theme-secondary"></p>
                    </div>
                  </div>
                  <a
                    href="https://t.me/+nLZEnpne-pQ1OWFl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pink-500 hover:text-pink-600 hover:underline text-sm break-all"
                  >
                    https://t.me/+nLZEnpne-pQ1OWFl
                  </a>
                </div>

                <div className="card p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 3c-1.862 0-3.505.928-4.5 2.344C11.005 3.928 9.362 3 7.5 3 4.462 3 2 5.462 2 8.5c0 4.171 4.912 8.213 6.281 9.49a2.94 2.94 0 0 0 2.438.94 2.94 2.94 0 0 0 2.438-.94C14.588 16.713 19.5 12.671 19.5 8.5 19.5 5.462 17.038 3 16.5 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-theme">QQ 群</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href="https://qm.qq.com/q/EZndy3xntQ"
                      target="_blank"
                      rel="noopener noreferrer"
                      className=" text-pink-500 hover:text-pink-600 hover:underline"
                    >
                      545402644
                    </a>
                  </div>
                </div>
              </div>

              {/* 版本信息 */}
              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl gradient-primary-br flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-theme">版本信息</div>
                      <div className="text-xs text-theme-muted">Lucky Lillia Bot {version}</div>
                      {qqVersion && <div className="text-xs text-theme-muted">QQ {qqVersion}</div>}
                    </div>
                  </div>
                  <div className="text-sm text-theme-secondary">
                    WebUI Powered by  <span className="font-semibold text-pink-500">React + Tailwind</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/20 dark:bg-black/40 flex items-center justify-center" style={{ zIndex: 9000 }}>
          <div className="bg-theme-card backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
            <Loader2 size={48} className="animate-spin text-pink-500 mx-auto" />
            <p className="mt-4 text-theme">加载中...</p>
          </div>
        </div>
      )}

      {/* Password Dialog */}
      <TokenDialog
        visible={showPasswordDialog}
        onConfirm={handlePasswordConfirm}
        error={passwordError}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        visible={showChangePasswordDialog}
        onClose={() => setShowChangePasswordDialog(false)}
        onSuccess={() => {
          // 密码修改成功后，更新 token 状态
          // 注意：set-token API 不返回新 token，我们需要重新获取配置
          window.location.reload();
        }}
      />

      {/* Toast Container */}
      <ToastContainer />

      {/* Settings Dialog */}
      <SettingsDialog
        visible={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />
    </div>
  );
}

export default App;
