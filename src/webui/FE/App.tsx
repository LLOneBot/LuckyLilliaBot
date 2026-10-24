import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sidebar,
  Dashboard,
  LogViewer,
  OtherConfig,
  otherSettings,
  TokenDialog,
  AuthTokenDialog,
  ChangePasswordDialog,
  QQLogin,
  ToastContainer,
  showToast,
  AnimatedBackground,
} from './components';
import { WebQQFullscreen } from './components/WebQQ';
import { PluginsPage } from './components/plugins';
import { iconByName } from './components/plugins/meta';
import { BUILTIN_PAGE_IDS, PluginPage, PluginPageUnavailable, usePluginHost, useVisiblePages } from './plugin-host';
import { Config, ResConfig } from './types';
import { apiFetch, setPasswordPromptHandler } from './utils/api';
import { deleteCookie } from './utils/cookie';
import { setCurrentUin } from './utils/currentUin';
import { hydrateWebQQStore } from './stores/webqqStore';
import { Save, Loader2, Menu } from 'lucide-react';
import { defaultConfig } from '../../main/config/defaultConfig'
import { version } from '../../version'
import SettingsDialog from './components/common/SettingsDialog'
import { useSettingsStore } from './stores/settingsStore'


const BUILTIN_TABS = ['dashboard', 'logs', 'other', 'plugins', 'about']

// Plugin pages register after the plugin list loads, so their tabs are recognised by shape:
// pages of builtin plugins by id, everything else as `<package>:<page id>`
const isPluginTab = (tab: string) => BUILTIN_PAGE_IDS.includes(tab) || tab === 'webqq-fullscreen' || tab.includes(':')

const isKnownTab = (tab: string) => BUILTIN_TABS.includes(tab) || isPluginTab(tab)

function App() {
  // 从 URL hash 读取初始 tab，默认 dashboard
  const getInitialTab = () => {
    const hash = window.location.hash.slice(1) // 去掉 #
    return isKnownTab(hash) ? hash : 'dashboard'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [envLocked, setEnvLocked] = useState<ResConfig['envLocked']>([]);
  const [instance, setInstance] = useState<string>();

  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [accountInfo, setAccountInfo] = useState<{ nick: string; uin: string } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordResolve, setPasswordResolve] = useState<((value: string) => void) | null>(null);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showAuthTokenDialog, setShowAuthTokenDialog] = useState(false);
  const [authTokenReason, setAuthTokenReason] = useState<'missing' | 'invalid'>('missing');
  const [authTokenPageUrl, setAuthTokenPageUrl] = useState('');
  const [qqVersion, setQqVersion] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const { autoHideSidebarInWebQQ } = useSettingsStore();
  usePluginHost(isLoggedIn);
  const pluginPages = useVisiblePages();
  const openablePages = useVisiblePages('open');
  const currentPluginPage = openablePages.find(page => page.key === activeTab);
  const sidebarPluginPages = useMemo(
    () => pluginPages.map(page => ({ id: page.key, title: page.title, icon: iconByName(page.icon), order: page.order })),
    [pluginPages],
  );

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
      if (isKnownTab(hash)) {
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
          setCurrentUin(response.data.selfInfo.uin);
          // uin 就位后才能加载 WebQQ 的按账号持久化数据 (store 是 skipHydration 的)
          hydrateWebQQStore(response.data.selfInfo.uin);

          // 获取主配置
          setConfig(response.data.config);
          setEnvLocked(response.data.envLocked ?? []);
          setInstance(response.data.instance);

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

  // 未登录时轮询 auth token 状态: 只在缺失/无效时弹强制录入框; 自愈(转 valid/validating)或登录中则关掉,
  // 避免弹框盖住二维码造成软锁死. 网络错误(error)不阻塞, 由 QQLogin 横幅提示. 在线则刷新进主界面.
  useEffect(() => {
    if (isLoggedIn || checkingLogin) return;
    let stop = false;
    const poll = async () => {
      try {
        const st = await apiFetch<{ applicable: boolean; online: boolean; hasToken: boolean; validation: string; authTokenPageUrl?: string }>('/api/auth-token/status');
        if (!stop && st.success) {
          const d = st.data;
          if (d.online) { window.location.reload(); return; }
          if (d.authTokenPageUrl) setAuthTokenPageUrl(d.authTokenPageUrl);
          if (d.applicable && (!d.hasToken || d.validation === 'invalid')) {
            setAuthTokenReason(d.validation === 'invalid' ? 'invalid' : 'missing');
            setShowAuthTokenDialog(true);
          } else if (d.validation === 'valid') {
            // 自愈/登录中: 关掉弹框露出二维码. validating/error 不动 (交给对话框自身轮询/QQLogin 横幅),
            // 避免把用户正在提交的弹框中途关掉.
            setShowAuthTokenDialog(false);
          }
        }
      } catch { /* ignore */ }
      if (!stop) setTimeout(poll, 3000);
    };
    poll();
    return () => { stop = true; };
  }, [isLoggedIn, checkingLogin]);

  // 保存配置 (邮件配置由邮件通知插件的设置页自己保存). 只提交调用方给的片段, 服务端合并进去
  const handleSave = useCallback(async (sections: Partial<Config>) => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: sections }),
      });

      if (!response.success) {
        showToast(response.message || '保存失败', 'error');
        return;
      }

      showToast('配置保存成功', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);


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

        {/* Auth Token 强制录入弹框 - 未登录且 token 缺失/无效时挡在扫码界面之上 */}
        <AuthTokenDialog
          visible={showAuthTokenDialog}
          reason={authTokenReason}
          authTokenPageUrl={authTokenPageUrl}
          onSuccess={() => window.location.reload()}
        />

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
  if (activeTab === 'webqq-fullscreen' && openablePages.some(page => page.key === 'webqq')) {
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
        pluginPages={sidebarPluginPages}
      />

      <main className={`flex-1 overflow-auto z-10 transition-all duration-300 ${sidebarCollapsed ? '' : 'md:ml-[17.5rem]'}`}>
        {/* 移动端顶部导航栏 */}
        <div className="md:hidden sticky top-0 z-30 glass glass-regular rounded-none px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo-64.webp"
              srcSet="/logo-64.webp 64w, /logo-128.webp 128w, /logo-192.webp 192w"
              sizes="32px"
              alt="Logo"
              className="w-8 h-8 rounded-lg"
            />
            <span className="font-semibold text-theme">LLBot</span>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {/* Header - 桌面端显示 */}
          <div className="mb-8 hidden md:block">
            <h2 className="text-3xl font-bold text-theme mb-2">
              {activeTab === 'dashboard' && 'Dashboard'}
            </h2>
            <p className="text-theme-secondary">
              {activeTab === 'dashboard' && '欢迎使用 Lucky Lillia Bot'}
            </p>
          </div>

          {/* Content */}
          {activeTab === 'dashboard' && <Dashboard llbotVersion={version} qqVersion={qqVersion} />}

          {currentPluginPage && <PluginPage page={currentPluginPage} />}

          {!currentPluginPage && isPluginTab(activeTab) && <PluginPageUnavailable tab={activeTab} />}

          {activeTab === 'logs' && <LogViewer />}

          {activeTab === 'plugins' && <PluginsPage />}

          {activeTab === 'other' && (
            <>
              <div className="pb-24">
                <OtherConfig
                  config={config}
                  onChange={setConfig}
                  envLocked={envLocked}
                  instance={instance}
                  onOpenChangePassword={() => setShowChangePasswordDialog(true)}
                />
              </div>
              {/* 固定在底部的保存按钮 */}
              <div className="fixed bottom-8 right-8 z-40">
                <button
                  onClick={() => handleSave(otherSettings(config, envLocked))}
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
                  <img
                    src="/logo-192.webp"
                    srcSet="/logo-128.webp 128w, /logo-192.webp 192w, /logo-256.webp 256w"
                    sizes="80px"
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
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
                    className="px-6 py-2.5 btn-primary transition-all flex items-center gap-2"
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
          <div className="glass glass-thick r-panel glass-pop p-6">
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
        onLogout={() => {
          deleteCookie('webui_token')
          window.location.reload()
        }}
      />
    </div>
  );
}

export default App;
