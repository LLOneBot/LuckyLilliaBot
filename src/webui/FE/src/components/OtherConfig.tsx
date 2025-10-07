import React from 'react';
import { Config } from '../types';

interface OtherConfigProps {
  config: Config;
  token: string;
  onChange: (config: Config) => void;
  onTokenChange: (token: string) => void;
}

const OtherConfig: React.FC<OtherConfigProps> = ({ config, token, onChange, onTokenChange }) => {
  const handleChange = (field: keyof Config, value: any) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">全局设置</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              心跳间隔 (ms)
            </label>
            <input
              type="number"
              value={config.heartInterval}
              onChange={(e) => handleChange('heartInterval', parseInt(e.target.value))}
              min="1000"
              max="600000"
              className="input-field"
            />
          </div>

          <div>
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">本地文件转URL</span>
              <input
                type="checkbox"
                checked={config.enableLocalFile2Url}
                onChange={(e) => handleChange('enableLocalFile2Url', e.target.checked)}
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

        <div className="grid grid-cols-2 gap-6 mt-6">
          <div>
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">调试模式</span>
              <input
                type="checkbox"
                checked={config.debug}
                onChange={(e) => handleChange('debug', e.target.checked)}
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
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">日志</span>
              <input
                type="checkbox"
                checked={config.log}
                onChange={(e) => handleChange('log', e.target.checked)}
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

        <div className="grid grid-cols-2 gap-6 mt-6">
          <div>
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">自动删除收到的文件</span>
              <input
                type="checkbox"
                checked={config.autoDeleteFile}
                onChange={(e) => handleChange('autoDeleteFile', e.target.checked)}
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
              自动删除文件时间 (秒)
            </label>
            <input
              type="number"
              value={config.autoDeleteFileSecond}
              onChange={(e) => handleChange('autoDeleteFileSecond', parseInt(e.target.value))}
              min="1"
              max="3600"
              className="input-field"
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            音乐签名地址
          </label>
          <input
            type="text"
            value={config.musicSignUrl}
            onChange={(e) => handleChange('musicSignUrl', e.target.value)}
            placeholder="请输入音乐签名地址"
            className="input-field"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            消息缓存过期 (秒)
          </label>
          <input
            type="number"
            value={config.msgCacheExpire}
            onChange={(e) => handleChange('msgCacheExpire', parseInt(e.target.value))}
            min="1"
            max="86400"
            className="input-field"
          />
        </div>

        <div className="grid grid-cols-2 gap-6 mt-6">
          <div>
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">接收离线消息</span>
              <input
                type="checkbox"
                checked={config.receiveOfflineMsg}
                onChange={(e) => handleChange('receiveOfflineMsg', e.target.checked)}
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
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">只监听本地地址</span>
              <input
                type="checkbox"
                checked={config.onlyLocalhost}
                onChange={(e) => handleChange('onlyLocalhost', e.target.checked)}
                className="w-12 h-6 rounded-full bg-gray-300 relative cursor-pointer appearance-none
                  checked:bg-gradient-to-r checked:from-blue-500 checked:to-purple-600
                  transition-colors duration-200 ease-in-out
                  before:content-[''] before:absolute before:top-0.5 before:left-0.5
                  before:w-5 before:h-5 before:rounded-full before:bg-white
                  before:transition-transform before:duration-200
                  checked:before:translate-x-6"
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">取消则监听0.0.0.0，暴露在公网请务必填写 Token</p>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            WebUI 密码
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="请输入密码"
            className="input-field"
          />
        </div>
      </div>
    </div>
  );
};

export default OtherConfig;
