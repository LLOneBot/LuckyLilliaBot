import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import OneBotConfigNew from './components/OneBotConfigNew';
import OtherConfig from './components/OtherConfig';
import TokenDialog from './components/TokenDialog';
import ChangePasswordDialog from './components/ChangePasswordDialog';
import QQLogin from './components/QQLogin';
import { ToastContainer, showToast } from './components/Toast';
import AnimatedBackground from './components/AnimatedBackground';
import { Config, ResConfig } from './types';
import { apiFetch, setPasswordPromptHandler } from './utils/api';
import { Save, Loader2, Settings, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { defaultConfig } from '../../common/defaultConfig'
import { version } from '../../version'


function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [accountInfo, setAccountInfo] = useState<{ nick: string; uin: string } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordResolve, setPasswordResolve] = useState<((value: string) => void) | null>(null);
  const [showSatoriToken, setShowSatoriToken] = useState(false);
  const [showMilkyToken, setShowMilkyToken] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);

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
          setConfig(response.data.config)
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

  // 保存配置（直接保存新格式）
  // configToSave: 可选，传入时使用传入的配置，否则使用当前 state
  const handleSave = useCallback(async (configToSave?: Config) => {
    try {
      setLoading(true);
      const finalConfig = configToSave || config;
      // console.log('Saving config:', finalConfig);
      const response = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: finalConfig }),
      });
      if (response.success) {
        showToast('配置保存成功', 'success');
      } else {
        showToast('保存失败：' + response.message, 'error');
      }
    } catch (error: any) {
      showToast('保存失败：' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [config]); // 依赖 config

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
          <Loader2 size={48} className="animate-spin text-blue-500" />
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

  // 已登录，显示主页面
  return (
    <div className="flex min-h-screen">
      {/* Animated Background */}
      <AnimatedBackground />

      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} accountInfo={accountInfo || undefined} />

      <main className="flex-1 p-8 overflow-auto z-10">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              {activeTab === 'dashboard' && 'Dashboard'}
              {/*{activeTab === 'onebot' && 'OneBot 11 配置'}*/}
              {/*{activeTab === 'satori' && 'Satori 配置'}*/}
              {/*{activeTab === 'other' && '其他配置'}*/}
              {/*{activeTab === 'about' && '关于'}*/}
            </h2>
            <p className="text-white/80">
              {activeTab === 'dashboard' && '欢迎使用 Lucky Lillia Bot'}
            </p>
          </div>

          {/* Content */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="card p-6 hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">OneBot 11</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    config.ob11.enable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {config.ob11.enable ? '已启用' : '未启用'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">OneBot 11 协议配置</p>
                <button
                  onClick={() => setActiveTab('onebot')}
                  className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700"
                >
                  前往配置 →
                </button>
              </div>

              <div className="card p-6 hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Satori</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    config.satori.enable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {config.satori.enable ? '已启用' : '未启用'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Satori 协议配置</p>
                <button
                  onClick={() => setActiveTab('satori')}
                  className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700"
                >
                  前往配置 →
                </button>
              </div>

              <div className="card p-6 hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Milky</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    config.milky.enable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {config.milky.enable ? '已启用' : '未启用'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Milky 协议配置</p>
                <button
                  onClick={() => setActiveTab('milky')}
                  className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700"
                >
                  前往配置 →
                </button>
              </div>

              <div className="card p-6 hover:scale-105">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">系统设置</h3>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    配置
                  </span>
                </div>
                <p className="text-sm text-gray-600">全局配置和系统选项</p>
                <button
                  onClick={() => setActiveTab('other')}
                  className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700"
                >
                  前往配置 →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'onebot' && (
            <OneBotConfigNew
              config={config.ob11}
              globalConfig={config}
              onChange={(newOb11Config) => {
                const newConfig = { ...config, ob11: newOb11Config };
                setConfig(newConfig);
              }}
              onSave={(newOb11Config) => {
                // 如果传入了新配置，使用新配置保存
                if (newOb11Config) {
                  const newConfig = { ...config, ob11: newOb11Config };
                  handleSave(newConfig);
                } else {
                  // 否则使用当前 state
                  handleSave();
                }
              }}
            />
          )}

          {activeTab === 'satori' && (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Settings size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Satori 协议</h3>
                  <p className="text-sm text-gray-600">配置 Satori 协议相关设置</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-gray-800">启用 Satori 协议</div>
                    <div className="text-xs text-gray-500 mt-0.5">开启后将支持 Satori 协议连接</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.satori.enable}
                    onChange={(e) => setConfig({
                      ...config,
                      satori: { ...config.satori, enable: e.target.checked }
                    })}
                    className="w-12 h-6 rounded-full bg-gray-300 relative cursor-pointer appearance-none
                      checked:bg-gradient-to-r checked:from-blue-500 checked:to-purple-600
                      transition-colors duration-200 ease-in-out
                      before:content-[''] before:absolute before:top-0.5 before:left-0.5
                      before:w-5 before:h-5 before:rounded-full before:bg-white
                      before:transition-transform before:duration-200
                      checked:before:translate-x-6"
                  />
                </div>

                {config.satori.enable && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      <p className="text-xs text-gray-500 mt-1">Satori 服务监听端口（1-65535）</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                        >
                          {showSatoriToken ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">用于 Satori 连接验证的 Token</p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button onClick={() => {
                  // 检查：如果 onlyLocalhost 为 false 且 satori 启用，token 必须设置
                  if (!config.onlyLocalhost && config.satori.enable && !config.satori.token?.trim()) {
                    showToast('当"只监听本地地址"关闭时，必须设置 Satori Token！', 'error');
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
                  <Settings size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Milky 协议</h3>
                  <p className="text-sm text-gray-600">配置 Milky 协议相关设置</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors">
                  <div>
                    <div className="text-sm font-medium text-gray-800">启用 Milky 协议</div>
                    <div className="text-xs text-gray-500 mt-0.5">开启后将支持 Milky 协议连接</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.milky.enable}
                    onChange={(e) => setConfig({
                      ...config,
                      milky: { ...config.milky, enable: e.target.checked }
                    })}
                    className="w-12 h-6 rounded-full bg-gray-300 relative cursor-pointer appearance-none
                      checked:bg-gradient-to-r checked:from-blue-500 checked:to-purple-600
                      transition-colors duration-200 ease-in-out
                      before:content-[''] before:absolute before:top-0.5 before:left-0.5
                      before:w-5 before:h-5 before:rounded-full before:bg-white
                      before:transition-transform before:duration-200
                      checked:before:translate-x-6"
                  />
                </div>

                {config.milky.enable && (
                  <>
                    <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors">
                      <div>
                        <div className="text-sm font-medium text-gray-800">上报自己发送的消息</div>
                        <div className="text-xs text-gray-500 mt-0.5">启用后将上报自己发送的消息</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.milky.reportSelfMessage}
                        onChange={(e) => setConfig({
                          ...config,
                          milky: { ...config.milky, reportSelfMessage: e.target.checked }
                        })}
                        className="w-12 h-6 rounded-full bg-gray-300 relative cursor-pointer appearance-none
                          checked:bg-gradient-to-r checked:from-blue-500 checked:to-purple-600
                          transition-colors duration-200 ease-in-out
                          before:content-[''] before:absolute before:top-0.5 before:left-0.5
                          before:w-5 before:h-5 before:rounded-full before:bg-white
                          before:transition-transform before:duration-200
                          checked:before:translate-x-6"
                      />
                    </div>

                    {/* HTTP 配置 */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-4">HTTP 配置</h4>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                          <p className="text-xs text-gray-500 mt-1">Milky HTTP 服务监听端口（1-65535）</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                          <p className="text-xs text-gray-500 mt-1">HTTP API 路径前缀（可选）</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                            >
                              {showMilkyToken ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">用于 Milky HTTP 连接验证的 Token</p>
                        </div>
                      </div>
                    </div>

                    {/* Webhook 配置 */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-4">Webhook 配置</h4>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
                          >
                            <Plus size={18} />
                            添加 Webhook URL
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">事件上报的 Webhook 地址</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button onClick={() => {
                  // 检查：如果 onlyLocalhost 为 false 且 milky 启用，accessToken 必须设置
                  if (!config.onlyLocalhost && config.milky.enable && !config.milky.http.accessToken?.trim()) {
                    showToast('当"只监听本地地址"关闭时，必须设置 Milky Access Token！', 'error');
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
                  onChange={setConfig}
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
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Lucky Lillia Bot</h1>
                <p className="text-gray-600 mb-6">使你的 QQNT 支持 OneBot 11 协议 和 Satori 协议进行 QQ 机器人开发</p>
                <div className="flex items-center justify-center gap-4">
                  <a
                    href="https://github.com/LLOneBot/LLOneBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    GitHub
                  </a>
                  <a
                    href="https://llonebot.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
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
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 3c-1.862 0-3.505.928-4.5 2.344C11.005 3.928 9.362 3 7.5 3 4.462 3 2 5.462 2 8.5c0 4.171 4.912 8.213 6.281 9.49a2.94 2.94 0 0 0 2.438.94 2.94 2.94 0 0 0 2.438-.94C14.588 16.713 19.5 12.671 19.5 8.5 19.5 5.462 17.038 3 16.5 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Telegram 群</h3>
                      <p className="text-sm text-gray-600"></p>
                    </div>
                  </div>
                  <a
                    href="https://t.me/+nLZEnpne-pQ1OWFl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 hover:underline text-sm break-all"
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
                      <h3 className="text-lg font-semibold text-gray-800">QQ 群</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href="https://qm.qq.com/q/EZndy3xntQ"
                      target="_blank"
                      rel="noopener noreferrer"
                      className=" text-blue-600 hover:text-blue-700 hover:underline"
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
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">版本信息</div>
                      <div className="text-xs text-gray-500">Lucky Lillia Bot {version}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    WebUI Powered by  <span className="font-semibold text-purple-600">React + Tailwind</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center" style={{ zIndex: 9000 }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <Loader2 size={48} className="animate-spin text-blue-600 mx-auto" />
            <p className="mt-4 text-gray-700">加载中...</p>
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
    </div>
  );
}

export default App;
