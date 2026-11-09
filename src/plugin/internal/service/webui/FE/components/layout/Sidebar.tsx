import React, { useLayoutEffect, useRef, useState } from 'react'
import GlassLens from '../common/GlassLens'
import { X, ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react'
import AccountsCard from './AccountsCard'

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Every entry: the pages of plugins, the WebUI's own included, in sidebar order. */
  pluginPages?: { id: string; title: string; icon: LucideIcon }[];
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isOpen = true,
  onClose,
  collapsed = false,
  onToggleCollapse,
  pluginPages = [],
}) => {
  const menuItems = pluginPages.map(page => ({ id: page.id, icon: page.icon, label: page.title }))

  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  // Recompute when the item set changes too, not only on tab switch: toggling a plugin adds/removes an
  // entry, which shifts the others, and a stale indicator would float in the gap the moved item left.
  const menuKey = menuItems.map(item => item.id).join(',')
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`)
    setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null)
  }, [activeTab, menuKey])

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
          className="fixed inset-0 scrim z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      {/* 侧边栏 */}
      <div className={`
        fixed top-3 bottom-3 left-3 z-50
        w-64 glass glass-regular r-window flex flex-col overflow-hidden
        transform transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-[110%]'}
        ${collapsed ? 'md:-translate-x-[110%]' : 'md:translate-x-0'}
      `}>
        <GlassLens />
        {/* Logo */}
        <div className='p-5 relative'>
          <div className='flex items-center gap-4'>
            <div className='w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0'>
              <img
                src='/logo-128.webp'
                srcSet='/logo-64.webp 64w, /logo-128.webp 128w, /logo-192.webp 192w, /logo-256.webp 256w'
                sizes='48px'
                alt='Logo'
                className='w-full h-full object-cover'
              />
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

        {/* Navigation. One highlight pill slides between items instead of each
            item painting its own, so a tab change reads as the highlight moving. */}
        <nav ref={navRef} className='relative flex-1 flex flex-col gap-1 px-3 py-2 overflow-y-auto'>
          {indicator && (
            <span
              aria-hidden='true'
              className='absolute left-3 right-3 r-control gradient-primary shadow-[0_6px_16px_-6px_rgba(219,39,119,0.55)] pointer-events-none transition-[top,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
              style={{ top: indicator.top, height: indicator.height }}
            />
          )}
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                data-tab={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`relative w-full flex items-center space-x-3 px-4 py-2.5 r-control transition-colors duration-200 ${
                  isActive ? 'text-white' : 'text-theme-secondary hover:text-theme hover:bg-theme-item-hover'
                }`}
              >
                <Icon size={20} />
                <span className='font-medium'>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <AccountsCard />
      </div>

      {/* 桌面端展开按钮 - 当侧边栏收起时显示 */}
      {collapsed && onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className='hidden md:flex fixed left-3 top-4 z-40 w-9 h-9 items-center justify-center glass glass-chrome glass-interactive r-capsule text-theme-muted hover:text-theme'
          title='展开侧边栏'
        >
          <ChevronRight size={18} />
        </button>
      )}
    </>
  )
}

export default Sidebar
