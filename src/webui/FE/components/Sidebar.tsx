import React from 'react'
import {
  LayoutDashboard,
  Settings,
  Info,
  Radio,
  Cpu,
  Sliders,
} from 'lucide-react'

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  accountInfo?: {
    nick: string;
    uin: string;
  };
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, accountInfo }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'onebot', icon: Radio, label: 'OneBot 11' },
    { id: 'satori', icon: Cpu, label: 'Satori' },
    { id: 'other', icon: Sliders, label: '其他配置' },
    { id: 'about', icon: Info, label: '关于' },
  ]

  return (
    <div
      className='w-64 bg-white/50 backdrop-blur-2xl h-screen flex flex-col shadow-xl border-r border-white/30 sticky top-0'>
      {/* Logo */}
      <div className='p-6 border-b border-white/20'>
        <div className='flex items-center gap-4'>
          <div className='w-12 h-12 rounded-2xl overflow-hidden shadow-lg flex-shrink-0'>
            <img src='/logo.jpg' alt='Logo' className='w-full h-full object-cover' />
          </div>
          <div className='flex-1 min-w-0'>
            <h1 className='text-xl font-bold text-gray-800 truncate'>LLTwoBot</h1>
            <p className='text-xs text-gray-500'>WebUI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className='flex-1 p-4 space-y-1'>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg scale-105'
                  : 'text-gray-700 hover:bg-white/50 hover:backdrop-blur-sm'
              }`}
            >
              <Icon size={20} />
              <span className='font-medium'>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Account Info */}
      {accountInfo && (
        <div className='p-4 border-t border-white/20'>
          <div className='flex items-center space-x-3 px-3 py-2'>
            <img
              src={`https://thirdqq.qlogo.cn/g?b=qq&nk=${accountInfo.uin}&s=640`}
              alt='头像'
              className='w-10 h-10 rounded-full object-cover ring-2 ring-white/50'
              onError={(e) => {
                // 头像加载失败时显示首字母
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                const fallback = target.nextElementSibling as HTMLElement
                if (fallback) fallback.style.display = 'flex'
              }}
            />
            <div
              className='w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-full items-center justify-center text-white font-semibold hidden'
              style={{ display: 'none' }}
            >
              {accountInfo.nick.charAt(0).toUpperCase()}
            </div>
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium text-gray-900 truncate'>
                {accountInfo.nick}
              </p>
              <p className='text-xs text-gray-500 truncate'>{accountInfo.uin}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
