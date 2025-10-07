import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Info, 
  Radio, 
  Cpu, 
  Sliders 
} from 'lucide-react';

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
  ];

  return (
    <div className="w-64 bg-white/70 backdrop-blur-xl h-screen flex flex-col shadow-xl border-r border-white/20">
      {/* Logo */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">LL</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">LLOneBot</h1>
            <p className="text-xs text-gray-500">配置管理</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-3">
          页面
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
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
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account Info */}
      {accountInfo && (
        <div className="p-4 border-t border-white/20">
          <div className="flex items-center space-x-3 px-3 py-2">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
              {accountInfo.nick.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {accountInfo.nick}
              </p>
              <p className="text-xs text-gray-500 truncate">{accountInfo.uin}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
