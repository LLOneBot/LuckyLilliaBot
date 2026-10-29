import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StatusNotices,
  Sidebar,
  TokenDialog,
  ToastContainer,
  AnimatedBackground,
} from './components';
import { iconByName } from './components/plugins/meta';
import {
  builtinPageKeys, PluginPage, PluginPageHeader, PluginPageUnavailable, usePluginHost, usePluginList, useVisiblePages,
} from './plugin-host';
import { ResConfig } from './types';
import { apiFetch, setPasswordPromptHandler } from './utils/api';
import { deleteCookie } from './utils/cookie';
import { useBotsPolling } from './stores/botsStore';
import { useLayout } from './stores/layoutStore';
import { Loader2, Menu } from 'lucide-react';
import SettingsDialog from './components/common/SettingsDialog'

// Every tab is a plugin page. Builtins register theirs before the first render (registerCorePages,
// startBuiltinClients); packages' pages come with the plugin list, so their tabs are recognised by shape,
// `<package>:<page id>`
const isKnownTab = (tab: string) => builtinPageKeys().has(tab) || tab.includes(':')

/** `#<tab>`, or `#<tab>?fullscreen` for a page on its own (ctx.pageHref). */
function readHash(): { tab: string; fullscreen: boolean } | undefined {
  const [tab, query = ''] = window.location.hash.slice(1).split('?')
  if (!isKnownTab(tab)) return
  return { tab, fullscreen: new URLSearchParams(query).has('fullscreen') }
}

function App() {
  // Unset: the first page of the sidebar, which is known once the plugin list is
  const [activeTab, setActiveTab] = useState<string | undefined>(() => readHash()?.tab);
  // Fixed for the window: such a page is opened in a window of its own and leaves it by its links
  const [fullscreen, setFullscreen] = useState(() => readHash()?.fullscreen ?? false);

  const [checkingLogin, setCheckingLogin] = useState(true);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordResolve, setPasswordResolve] = useState<((value: string) => void) | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarCollapsed = useLayout(state => state.sidebarCollapsed);
  const setSidebarCollapsed = useLayout(state => state.setSidebarCollapsed);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  usePluginHost(!checkingLogin);
  useBotsPolling(!checkingLogin);
  const plugins = usePluginList(state => state.plugins);
  const pluginPages = useVisiblePages();
  const openablePages = useVisiblePages('open');
  const tab = activeTab ?? pluginPages[0]?.key ?? 'plugins';
  const currentPluginPage = openablePages.find(page => page.key === tab);
  const sidebarPluginPages = useMemo(
    () => pluginPages.map(page => ({ id: page.key, title: page.title, icon: iconByName(page.icon) })),
    [pluginPages],
  );

  useEffect(() => {
    setPasswordPromptHandler(async (tip: string) => {
      return new Promise<string>((resolve) => {
        setPasswordError(tip || '');
        setShowPasswordDialog(true);
        setPasswordResolve(() => resolve);
      });
    });
  }, []);

  const listed = plugins !== null
  useEffect(() => {
    // Not before the list is in: the default tab is only known then
    if (!listed) return
    window.location.hash = fullscreen ? `${tab}?fullscreen` : tab
    useLayout.setState({ activeTab: tab })
  }, [tab, fullscreen, listed])

  useEffect(() => {
    const handleHashChange = () => {
      const view = readHash()
      if (view) {
        setActiveTab(view.tab)
        setFullscreen(view.fullscreen)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

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

  useEffect(() => {
    // Any call behind the login: it asks for the password when there is none or it is wrong
    apiFetch<ResConfig>('/api/config')
      .catch(error => console.error('Failed to check login status:', error))
      .finally(() => setCheckingLogin(false));
  }, []);

  // The sidebar is the plugin list's: drawn before it, its entries would pop in one by one
  if (checkingLogin || !listed) {
    return (
      <>
        <AnimatedBackground />

        <div className="relative flex items-center justify-center min-h-screen z-10">
          <Loader2 size={48} className="animate-spin text-pink-500" />
        </div>

        {/* 加载时也可能 401, 要能设置密码 */}
        <TokenDialog
          visible={showPasswordDialog}
          onConfirm={handlePasswordConfirm}
          error={passwordError}
        />
      </>
    );
  }

  if (fullscreen) {
    return (
      <>
        <AnimatedBackground />

        <div className="relative h-screen overflow-auto p-4 md:p-8 z-10">
          {currentPluginPage ? <PluginPage page={currentPluginPage} fullscreen /> : <PluginPageUnavailable tab={tab} />}
        </div>

        <TokenDialog
          visible={showPasswordDialog}
          onConfirm={handlePasswordConfirm}
          error={passwordError}
        />

        <ToastContainer />
      </>
    )
  }

  return (
    <div className="flex min-h-screen">
      <AnimatedBackground />

      <Sidebar
        activeTab={tab}
        onTabChange={setActiveTab}
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
          <StatusNotices activeTab={tab} onOpen={setActiveTab} />
          {/* Header - 桌面端显示: the page's own (PageOptions.header), else just room */}
          <div className="mb-8 hidden md:block">
            {currentPluginPage && <PluginPageHeader page={currentPluginPage} />}
          </div>

          {currentPluginPage ? <PluginPage page={currentPluginPage} /> : <PluginPageUnavailable tab={tab} />}
        </div>
      </main>

      <TokenDialog
        visible={showPasswordDialog}
        onConfirm={handlePasswordConfirm}
        error={passwordError}
      />

      <ToastContainer />

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
