import React, { useState } from 'react';
import { OB11Config } from '../types';
import { X } from 'lucide-react';

interface OneBotConfigProps {
  config: OB11Config;
  onChange: (config: OB11Config) => void;
}

const OneBotConfig: React.FC<OneBotConfigProps> = ({ config, onChange }) => {
  const [wsInput, setWsInput] = useState('');
  const [httpInput, setHttpInput] = useState('');

  const handleChange = (field: keyof OB11Config, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const addWsUrl = () => {
    if (wsInput.trim() && !/^wss?:\/\//.test(wsInput)) {
      alert('反向WS地址必须以 ws:// 或 wss:// 开头');
      return;
    }
    if (wsInput.trim() && !config.wsReverseUrls.includes(wsInput.trim())) {
      handleChange('wsReverseUrls', [...config.wsReverseUrls, wsInput.trim()]);
      setWsInput('');
    }
  };

  const removeWsUrl = (index: number) => {
    const newUrls = [...config.wsReverseUrls];
    newUrls.splice(index, 1);
    handleChange('wsReverseUrls', newUrls);
  };

  const addHttpUrl = () => {
    if (httpInput.trim() && !/^https?:\/\//.test(httpInput)) {
      alert('HTTP上报地址必须以 http:// 或 https:// 开头');
      return;
    }
    if (httpInput.trim() && !config.httpPostUrls.includes(httpInput.trim())) {
      handleChange('httpPostUrls', [...config.httpPostUrls, httpInput.trim()]);
      setHttpInput('');
    }
  };

  const removeHttpUrl = (index: number) => {
    const newUrls = [...config.httpPostUrls];
    newUrls.splice(index, 1);
    handleChange('httpPostUrls', newUrls);
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">OneBot 11 协议</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">启用 OneBot 11</span>
              <input
                type="checkbox"
                checked={config.enable}
                onChange={(e) => handleChange('enable', e.target.checked)}
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
              OneBot 11 Token
            </label>
            <input
              type="password"
              value={config.token}
              onChange={(e) => handleChange('token', e.target.value)}
              placeholder="请输入 Token"
              className="input-field"
            />
          </div>
        </div>

        {config.enable && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">启用正向 WS 服务</span>
                  <input
                    type="checkbox"
                    checked={config.enableWs}
                    onChange={(e) => handleChange('enableWs', e.target.checked)}
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
                  正向 WS 端口
                </label>
                <input
                  type="number"
                  value={config.wsPort}
                  onChange={(e) => handleChange('wsPort', parseInt(e.target.value))}
                  min="1"
                  max="65535"
                  className="input-field"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">启用反向 WS 服务</span>
                <input
                  type="checkbox"
                  checked={config.enableWsReverse}
                  onChange={(e) => handleChange('enableWsReverse', e.target.checked)}
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
                反向 WS 地址
              </label>
              <input
                type="text"
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addWsUrl()}
                placeholder="输入后回车添加"
                className="input-field"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {config.wsReverseUrls.map((url, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {url}
                    <button onClick={() => removeWsUrl(index)} className="hover:text-blue-600">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">启用 HTTP 服务</span>
                  <input
                    type="checkbox"
                    checked={config.enableHttp}
                    onChange={(e) => handleChange('enableHttp', e.target.checked)}
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
                  HTTP 端口
                </label>
                <input
                  type="number"
                  value={config.httpPort}
                  onChange={(e) => handleChange('httpPort', parseInt(e.target.value))}
                  min="1"
                  max="65535"
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">启用 HTTP 上报</span>
                  <input
                    type="checkbox"
                    checked={config.enableHttpPost}
                    onChange={(e) => handleChange('enableHttpPost', e.target.checked)}
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
                  <span className="text-sm font-medium text-gray-700">启用 HTTP 心跳</span>
                  <input
                    type="checkbox"
                    checked={config.enableHttpHeart}
                    onChange={(e) => handleChange('enableHttpHeart', e.target.checked)}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HTTP 上报地址
              </label>
              <input
                type="text"
                value={httpInput}
                onChange={(e) => setHttpInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addHttpUrl()}
                placeholder="输入后回车添加"
                className="input-field"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {config.httpPostUrls.map((url, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                  >
                    {url}
                    <button onClick={() => removeHttpUrl(index)} className="hover:text-green-600">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HTTP 上报密钥
              </label>
              <input
                type="password"
                value={config.httpSecret}
                onChange={(e) => handleChange('httpSecret', e.target.value)}
                placeholder="请输入密钥"
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  消息上报格式
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="messageFormat"
                      value="array"
                      checked={config.messagePostFormat === 'array'}
                      onChange={(e) => handleChange('messagePostFormat', e.target.value as 'array' | 'string')}
                      className="mr-2"
                    />
                    消息段
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="messageFormat"
                      value="string"
                      checked={config.messagePostFormat === 'string'}
                      onChange={(e) => handleChange('messagePostFormat', e.target.value as 'array' | 'string')}
                      className="mr-2"
                    />
                    CQ码
                  </label>
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">上报自己发出的消息</span>
                  <input
                    type="checkbox"
                    checked={config.reportSelfMessage}
                    onChange={(e) => handleChange('reportSelfMessage', e.target.checked)}
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
        )}
      </div>
    </div>
  );
};

export default OneBotConfig;
