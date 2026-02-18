import React from 'react'
import {
  LayoutDashboard,
  Info,
  Radio,
  Cpu,
  Sliders,
  Milk,
  Terminal,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react'

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  accountInfo?: {
    nick: string;
    uin: string;
  };
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSettings?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onTabChange, 
  accountInfo, 
  isOpen = true, 
  onClose,
  collapsed = false,
  onToggleCollapse,
  onOpenSettings,
}) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'onebot', icon: Radio, label: 'OneBot 11' },
    { id: 'satori', icon: Cpu, label: 'Satori' },
    { id: 'milky', icon: Milk, label: 'Milky' },
    { id: 'logs', icon: Terminal, label: '日志' },
    { id: 'other', icon: Sliders, label: '其他配置' },
    { id: 'webqq', icon: MessageSquare, label: 'WebQQ' },
    { id: 'about', icon: Info, label: '关于' },
  ]

  const handleTabChange = (tab: string) => {
    onTabChange(tab)
    // 移动端点击后关闭侧边栏
    if (onClose && window.innerWidth < 768) {
      onClose()
    }
  }

  return (
    <>
      {/* 移动端遮罩 */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      {/* 侧边栏 */}
      <div className={`
        fixed top-0 left-0 z-50
        w-64 bg-theme-card backdrop-blur-2xl h-screen flex flex-col shadow-xl border-r border-theme
        transform transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${collapsed ? 'md:-translate-x-full' : 'md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className='p-6 border-b border-theme-divider relative'>
          <div className='flex items-center gap-4'>
            <div className='w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0'>
              <img src='/logo.jpg' alt='Logo' className='w-full h-full object-cover' />
            </div>
            <div className='flex-1 min-w-0'>
              <h1 className='text-xl font-bold text-theme truncate'>LLBot</h1>
              <p className='text-xs text-theme-muted'>WebUI</p>
            </div>
            {/* 移动端关闭按钮 */}
            <button 
              onClick={onClose}
              className='md:hidden p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors'
            >
              <X size={20} />
            </button>
            {/* 桌面端关闭按钮 */}
            {onToggleCollapse && (
              <button 
                onClick={onToggleCollapse}
                className='hidden md:block p-2 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors'
                title='收起侧边栏'
              >
                <ChevronLeft size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className='flex-1 p-4 space-y-1 overflow-y-auto'>
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'gradient-primary text-white shadow-lg scale-105'
                    : 'text-theme hover:bg-theme-item-hover'
                }`}
              >
                <Icon size={20} />
                <span className='font-medium'>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Account Info & Settings */}
        <div className='p-4 border-t border-theme-divider'>
          <div className='flex items-center space-x-3 px-3 py-2'>
            {accountInfo && (
              <>
                <img
                  src={`https://thirdqq.qlogo.cn/g?b=qq&nk=${accountInfo.uin}&s=640`}
                  alt='头像'
                  className='w-10 h-10 rounded-full object-cover ring-2 ring-white/50 dark:ring-neutral-600'
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <div
                  className='w-10 h-10 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full items-center justify-center text-white font-semibold hidden'
                  style={{ display: 'none' }}
                >
                  {accountInfo.nick.charAt(0).toUpperCase()}
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium text-theme truncate'>
                    {accountInfo.nick}
                  </p>
                  <p className='text-xs text-theme-muted truncate'>{accountInfo.uin}</p>
                </div>
              </>
            )}
            {!accountInfo && <div className='flex-1' />}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg transition-all duration-200 text-theme-muted hover:bg-theme-item hover:text-theme"
              title="设置"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
      
      {/* 桌面端展开按钮 - 当侧边栏收起时显示 */}
      {collapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className='hidden md:flex fixed left-2 top-4 z-40 w-8 h-8 items-center justify-center bg-theme-card/80 backdrop-blur-sm border border-theme-divider rounded-md text-theme-muted hover:text-theme hover:bg-theme-card transition-all shadow-md hover:shadow-lg'
          title='展开侧边栏'
        >
          <ChevronRight size={18} />
        </button>
      )}
    </>
  )
}

export default Sidebar
