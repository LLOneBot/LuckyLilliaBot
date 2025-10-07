import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import OneBotConfigNew from './components/OneBotConfigNew';
import OtherConfig from './components/OtherConfig';
import TokenDialog from './components/TokenDialog';
import QQLogin from './components/QQLogin';
import { ToastContainer, showToast } from './components/Toast';
import AnimatedBackground from './components/AnimatedBackground';
import { Config, ResConfig } from './types';
import { apiFetch, getToken, setPasswordPromptHandler, setTokenStorage } from './utils/api';
import { Save, Loader2 } from 'lucide-react';

// 默认配置
const defaultConfig: Config = {
  ob11: {
    enable: false,
    connect: [
      {
        type: 'ws',
        enable: false,
        port: 3001,
        heartInterval: 30000,
        token: '',
        messageFormat: 'array',
        reportSelfMessage: false,
        reportOfflineMessage: false,
        debug: false,
      },
      {
        type: 'ws-reverse',
        enable: false,
        url: '',
        heartInterval: 30000,
        token: '',
        messageFormat: 'array',
        reportSelfMessage: false,
        reportOfflineMessage: false,
        debug: false,
      },
      {
        type: 'http',
        enable: false,
        port: 3000,
        token: '',
        messageFormat: 'array',
        reportSelfMessage: false,
        reportOfflineMessage: false,
        debug: false,
      },
      {
        type: 'http-post',
        enable: false,
        url: '',
        enableHeart: false,
        heartInterval: 30000,
        token: '',
        messageFormat: 'array',
        reportSelfMessage: false,
        reportOfflineMessage: false,
        debug: false,
      },
    ],
  },
  satori: {
    enable: false,
    port: 5500,
    token: '',
  },
  heartInterval: 30000,
  enableLocalFile2Url: false,
  debug: false,
  log: false,
  autoDeleteFile: false,
  autoDeleteFileSecond: 60,
  musicSignUrl: '',
  msgCacheExpire: 3600,
  receiveOfflineMsg: false,
  onlyLocalhost: true,
  webui: {
    token: '',
  },
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [accountInfo, setAccountInfo] = useState<{ nick: string; uin: string } | null>(null);
  const [token, setToken] = useState(getToken() || '');
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordResolve, setPasswordResolve] = useState<((value: string) => void) | null>(null);

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
          setToken(response.data.token);
          setAccountInfo({
            nick: response.data.selfInfo.nick || '',
            uin: response.data.selfInfo.uin,
          });
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
      console.log('Saving config:', finalConfig);
      const response = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, config: finalConfig }),
      });
      if (response.success) {
        setTokenStorage(token);
        showToast('配置保存成功', 'success');
      } else {
        showToast('保存失败：' + response.message, 'error');
      }
    } catch (error: any) {
      showToast('保存失败：' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [config, token]); // 依赖 config 和 token

  // 登录成功回调
  const handleLoginSuccess = useCallback(() => {
    window.location.reload();
  }, []);

  // 加载中
  if (checkingLogin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={48} className="animate-spin text-blue-500" />
      </div>
    );
  }

  // 未登录，显示登录页面
  if (!isLoggedIn) {
    return (
      <>
        <QQLogin onLoginSuccess={handleLoginSuccess} />
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

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'onebot' && 'OneBot 11 配置'}
              {activeTab === 'satori' && 'Satori 配置'}
              {activeTab === 'other' && '其他配置'}
              {activeTab === 'about' && '关于'}
            </h2>
            <p className="text-white/80">
              {activeTab === 'dashboard' && '欢迎使用 LLTwoBot 配置管理系统'}
              {activeTab === 'onebot' && '配置 OneBot 11 协议相关设置'}
              {activeTab === 'satori' && '配置 Satori 协议相关设置'}
              {activeTab === 'other' && '配置全局设置和其他选项'}
              {activeTab === 'about' && '关于 LLTwoBot 项目'}
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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Satori 协议</h3>
              <div className="space-y-4">
                <div>
                  <label className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">启用 Satori</span>
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
                  </label>
                </div>
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
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Satori Token
                  </label>
                  <input
                    type="password"
                    value={config.satori.token}
                    onChange={(e) => setConfig({
                      ...config,
                      satori: { ...config.satori, token: e.target.value }
                    })}
                    placeholder="Satori Token"
                    className="input-field"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={handleSave} disabled={loading} className="btn-primary flex items-center gap-2">
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
              <OtherConfig
                config={config}
                token={token}
                onChange={setConfig}
                onTokenChange={setToken}
              />
              <div className="mt-6 flex justify-end">
                <button onClick={handleSave} disabled={loading} className="btn-primary flex items-center gap-2">
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
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">GitHub</h3>
                <a
                  href="https://github.com/LLOneBot/LLOneBot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  https://github.com/LLOneBot/LLOneBot
                </a>
              </div>
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">文档</h3>
                <a
                  href="https://llonebot.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  https://llonebot.com
                </a>
              </div>
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">QQ 群</h3>
                <a
                  href="https://qm.qq.com/q/EZndy3xntQ"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-2xl font-bold text-blue-600 hover:text-blue-700 hover:underline"
                >
                  545402644
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
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

      {/* Toast Container */}
      <ToastContainer />
    </div>
  );
}

export default App;
