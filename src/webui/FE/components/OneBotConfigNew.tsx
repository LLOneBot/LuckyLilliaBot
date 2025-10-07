import React, { useState } from 'react';
import { OB11Config, ConnectConfig, WsConnectConfig, WsReverseConnectConfig, HttpConnectConfig, HttpPostConnectConfig } from '../types';
import { Radio, Wifi, Globe, Send, X, Settings, Plus, Trash2, Edit2 } from 'lucide-react';

interface OneBotConfigProps {
  config: OB11Config;
  onChange: (config: OB11Config) => void;
  onSave: (config?: OB11Config) => void; // 可以接受新配置
}

const OneBotConfigNew: React.FC<OneBotConfigProps> = ({ config, onChange, onSave }) => {
  const [selectedAdapter, setSelectedAdapter] = useState<ConnectConfig | null>(null);
  const [selectedAdapterIndex, setSelectedAdapterIndex] = useState<number>(-1);
  const [showDialog, setShowDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isNewAdapter, setIsNewAdapter] = useState(false); // 标记是否为新建适配器
  const [editingName, setEditingName] = useState(false); // 标记是否正在编辑名称
  const [tempName, setTempName] = useState(''); // 临时名称

  const adapterInfo = {
    'ws': { icon: Radio, name: 'WebSocket正向', desc: '提供WebSocket服务器' },
    'ws-reverse': { icon: Wifi, name: 'WebSocket反向', desc: '作为客户端连接到WebSocket服务' },
    'http': { icon: Globe, name: 'HTTP服务', desc: '提供HTTP API服务' },
    'http-post': { icon: Send, name: 'HTTP上报', desc: '上报事件到HTTP服务器' },
  };

  const handleAdapterClick = (adapter: ConnectConfig, index: number) => {
    setSelectedAdapter(adapter);
    setSelectedAdapterIndex(index);
    setIsNewAdapter(false); // 编辑现有适配器
    setEditingName(false);
    setTempName(adapter.name || '');
    setShowDialog(true);
  };

  const handleStartEditName = (e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发卡片点击
    setEditingName(true);
  };

  const handleSaveName = () => {
    if (!selectedAdapter) return;
    
    // 只更新 selectedAdapter 状态，不立即保存
    // 等点击对话框的"保存"按钮时才保存到后端
    const updatedAdapter = { ...selectedAdapter, name: tempName.trim() };
    setSelectedAdapter(updatedAdapter);
    setEditingName(false);
  };

  const handleCancelEditName = () => {
    setTempName(selectedAdapter?.name || '');
    setEditingName(false);
  };

  const handleSaveAdapter = () => {
    if (!selectedAdapter) return;

    let newConnect: ConnectConfig[];

    if (isNewAdapter) {
      // 新建适配器：添加到数组
      newConnect = [...config.connect, selectedAdapter];
    } else {
      // 编辑现有适配器：更新数组中的项
      if (selectedAdapterIndex < 0) return;
      newConnect = [...config.connect];
      newConnect[selectedAdapterIndex] = selectedAdapter;
    }

    const newConfig = { ...config, connect: newConnect };
    onChange(newConfig);
    setShowDialog(false);
    setIsNewAdapter(false);

    // 保存时触发后端保存，传入新配置
    onSave(newConfig);
  };

  const handleDeleteAdapter = () => {
    // 如果是新建的适配器，直接关闭对话框即可
    if (isNewAdapter) {
      setShowDialog(false);
      setIsNewAdapter(false);
      return;
    }

    // 删除现有适配器
    if (selectedAdapterIndex < 0) return;

    const newConnect = config.connect.filter((_, index) => index !== selectedAdapterIndex);
    const newConfig = { ...config, connect: newConnect };
    onChange(newConfig);
    setShowDialog(false);

    // 删除时触发后端保存，传入新配置
    onSave(newConfig);
  };

  const handleAddAdapter = (type: 'ws' | 'ws-reverse' | 'http' | 'http-post') => {
    const baseConfig = {
      enable: true, // 默认启用
      token: '',
      messageFormat: 'array' as const,
      reportSelfMessage: false,
      reportOfflineMessage: false,
      debug: false,
    };

    let newAdapter: ConnectConfig;
    switch (type) {
      case 'ws':
        newAdapter = { ...baseConfig, type: 'ws', port: 3001, heartInterval: 60000 };
        break;
      case 'ws-reverse':
        newAdapter = { ...baseConfig, type: 'ws-reverse', url: '', heartInterval: 60000 };
        break;
      case 'http':
        newAdapter = { ...baseConfig, type: 'http', port: 3000 };
        break;
      case 'http-post':
        newAdapter = { ...baseConfig, type: 'http-post', url: '', enableHeart: false, heartInterval: 60000 };
        break;
    }

    // 关闭添加对话框
    setShowAddDialog(false);

    // 设置为新建模式并打开编辑对话框
    setSelectedAdapter(newAdapter);
    setSelectedAdapterIndex(-1); // 新建时索引设为-1
    setIsNewAdapter(true); // 标记为新建适配器
    setShowDialog(true);

    // 注意：这里不添加到数组，只有点击保存按钮才真正添加
  };

  const updateSelectedAdapter = (field: string, value: any) => {
    if (!selectedAdapter) return;
    setSelectedAdapter({ ...selectedAdapter, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* 总开关 */}
      <div className="card p-6">
        <label className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">OneBot 11 协议</h3>
            <p className="text-sm text-gray-600 mt-1">启用或禁用 OneBot 11 适配器</p>
          </div>
          <input
            type="checkbox"
            checked={config.enable}
            onChange={(e) => {
              const newConfig = { ...config, enable: e.target.checked };
              onChange(newConfig);
              console.log('Config updated:', newConfig);
              // 总开关变更时保存，直接传入新配置
              onSave(newConfig);
            }}
            className="w-14 h-7 rounded-full bg-gray-300 relative cursor-pointer appearance-none
              checked:bg-gradient-to-r checked:from-blue-500 checked:to-purple-600
              transition-colors duration-200 ease-in-out
              before:content-[''] before:absolute before:top-0.5 before:left-0.5
              before:w-6 before:h-6 before:rounded-full before:bg-white
              before:transition-transform before:duration-200
              checked:before:translate-x-7"
          />
        </label>
      </div>

      {/* 适配器卡片 */}
      {config.enable && config.connect && Array.isArray(config.connect) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {config.connect.map((adapter, index) => {
            const info = adapterInfo[adapter.type as keyof typeof adapterInfo];
            const Icon = info.icon;

            return (
              <div
                key={index}
                className={`card p-6 cursor-pointer hover:scale-105 transition-all ${
                  adapter.enable ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleAdapterClick(adapter, index)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                      adapter.enable
                        ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      <Icon size={24} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-800">
                        {adapter.name || info.name}
                      </h4>
                      <p className="text-sm text-gray-600">{info.desc}</p>
                    </div>
                  </div>
                  <Settings size={20} className="text-gray-400" />
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                    adapter.enable
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {adapter.enable ? '已启用' : '未启用'}
                  </span>
                  {(adapter.type === 'ws' || adapter.type === 'http') && adapter.enable && (
                    <span className="text-sm text-gray-600">
                      端口: {(adapter as WsConnectConfig | HttpConnectConfig).port}
                    </span>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {/* 添加按钮 */}
          <div className="flex justify-center mt-6">
            <button
              onClick={() => setShowAddDialog(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={20} />
              添加适配器
            </button>
          </div>
        </>
      )}

      {/* 配置弹窗 */}
      {showDialog && selectedAdapter && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/20">
              <div className="flex items-center gap-3 flex-1">
                {editingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') handleCancelEditName();
                      }}
                      placeholder="输入自定义名称"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                    >
                      确定
                    </button>
                    <button
                      onClick={handleCancelEditName}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {isNewAdapter ? '新建 - ' : ''}
                      {selectedAdapter.name || adapterInfo[selectedAdapter.type as keyof typeof adapterInfo].name}
                    </h3>
                    <button
                      onClick={handleStartEditName}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="编辑名称"
                    >
                      <Edit2 size={18} />
                    </button>
                  </>
                )}
              </div>
              <button onClick={() => {
                setShowDialog(false);
                setIsNewAdapter(false);
                setEditingName(false);
              }} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* 启用开关 */}
              <div>
                <label className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">启用此适配器</span>
                  <input
                    type="checkbox"
                    checked={selectedAdapter.enable}
                    onChange={(e) => updateSelectedAdapter('enable', e.target.checked)}
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

              {/* WS正向 */}
              {selectedAdapter.type === 'ws' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">端口</label>
                    <input
                      type="number"
                      value={(selectedAdapter as WsConnectConfig).port}
                      onChange={(e) => updateSelectedAdapter('port', parseInt(e.target.value))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">心跳间隔 (ms)</label>
                    <input
                      type="number"
                      value={(selectedAdapter as WsConnectConfig).heartInterval}
                      onChange={(e) => updateSelectedAdapter('heartInterval', parseInt(e.target.value))}
                      className="input-field"
                    />
                  </div>
                </>
              )}

              {/* WS反向 */}
              {selectedAdapter.type === 'ws-reverse' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">连接地址</label>
                    <input
                      type="text"
                      value={(selectedAdapter as WsReverseConnectConfig).url}
                      onChange={(e) => updateSelectedAdapter('url', e.target.value)}
                      placeholder="ws://example.com:8080"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">心跳间隔 (ms)</label>
                    <input
                      type="number"
                      value={(selectedAdapter as WsReverseConnectConfig).heartInterval}
                      onChange={(e) => updateSelectedAdapter('heartInterval', parseInt(e.target.value))}
                      className="input-field"
                    />
                  </div>
                </>
              )}

              {/* HTTP */}
              {selectedAdapter.type === 'http' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">端口</label>
                  <input
                    type="number"
                    value={(selectedAdapter as HttpConnectConfig).port}
                    onChange={(e) => updateSelectedAdapter('port', parseInt(e.target.value))}
                    className="input-field"
                  />
                </div>
              )}

              {/* HTTP上报 */}
              {selectedAdapter.type === 'http-post' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">上报地址</label>
                    <input
                      type="text"
                      value={(selectedAdapter as HttpPostConnectConfig).url}
                      onChange={(e) => updateSelectedAdapter('url', e.target.value)}
                      placeholder="http://example.com:8080/webhook"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">启用心跳</span>
                      <input
                        type="checkbox"
                        checked={(selectedAdapter as HttpPostConnectConfig).enableHeart}
                        onChange={(e) => updateSelectedAdapter('enableHeart', e.target.checked)}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">心跳间隔 (ms)</label>
                    <input
                      type="number"
                      value={(selectedAdapter as HttpPostConnectConfig).heartInterval}
                      onChange={(e) => updateSelectedAdapter('heartInterval', parseInt(e.target.value))}
                      className="input-field"
                    />
                  </div>
                </>
              )}

              {/* 通用配置 */}
              <div className="border-t border-gray-200 pt-6">
                <h4 className="text-md font-semibold text-gray-800 mb-4">通用配置</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
                    <input
                      type="password"
                      value={selectedAdapter.token}
                      onChange={(e) => updateSelectedAdapter('token', e.target.value)}
                      placeholder="访问令牌"
                      className="input-field"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">消息格式</label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="array"
                          checked={selectedAdapter.messageFormat === 'array'}
                          onChange={(e) => updateSelectedAdapter('messageFormat', e.target.value)}
                          className="mr-2"
                        />
                        消息段 (array)
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="string"
                          checked={selectedAdapter.messageFormat === 'string'}
                          onChange={(e) => updateSelectedAdapter('messageFormat', e.target.value)}
                          className="mr-2"
                        />
                        CQ码 (string)
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">上报自己发送的消息</span>
                      <input
                        type="checkbox"
                        checked={selectedAdapter.reportSelfMessage}
                        onChange={(e) => updateSelectedAdapter('reportSelfMessage', e.target.checked)}
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
                    <label className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">上报离线消息</span>
                      <input
                        type="checkbox"
                        checked={selectedAdapter.reportOfflineMessage}
                        onChange={(e) => updateSelectedAdapter('reportOfflineMessage', e.target.checked)}
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
                    <label className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">调试模式</span>
                      <input
                        type="checkbox"
                        checked={selectedAdapter.debug}
                        onChange={(e) => updateSelectedAdapter('debug', e.target.checked)}
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
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-white/20">
              {!isNewAdapter && (
                <button
                  onClick={handleDeleteAdapter}
                  className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <Trash2 size={18} />
                  删除
                </button>
              )}
              {isNewAdapter && <div />} {/* 占位 */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDialog(false)}
                  className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveAdapter}
                  className="btn-primary"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加适配器对话框 */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-white/20">
              <h3 className="text-xl font-semibold text-gray-900">选择适配器类型</h3>
              <button onClick={() => setShowAddDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <button
                onClick={() => handleAddAdapter('ws')}
                className="w-full p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition-all flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Radio size={24} />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-gray-800">WebSocket正向</h4>
                  <p className="text-sm text-gray-600">作为WebSocket服务器</p>
                </div>
              </button>

              <button
                onClick={() => handleAddAdapter('ws-reverse')}
                className="w-full p-4 rounded-2xl bg-gradient-to-br from-green-50 to-teal-50 hover:from-green-100 hover:to-teal-100 transition-all flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wifi size={24} />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-gray-800">WebSocket反向</h4>
                  <p className="text-sm text-gray-600">作为客户端连接到WebSocket服务端</p>
                </div>
              </button>

              <button
                onClick={() => handleAddAdapter('http')}
                className="w-full p-4 rounded-2xl bg-gradient-to-br from-orange-50 to-red-50 hover:from-orange-100 hover:to-red-100 transition-all flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Globe size={24} />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-gray-800">HTTP服务</h4>
                  <p className="text-sm text-gray-600">提供HTTP API服务</p>
                </div>
              </button>

              <button
                onClick={() => handleAddAdapter('http-post')}
                className="w-full p-4 rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 hover:from-pink-100 hover:to-rose-100 transition-all flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Send size={24} />
                </div>
                <div className="text-left">
                  <h4 className="text-lg font-semibold text-gray-800">HTTP上报</h4>
                  <p className="text-sm text-gray-600">上报事件到HTTP服务器</p>
                </div>
              </button>
            </div>

            <div className="flex justify-end p-6 border-t border-white/20">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneBotConfigNew;
