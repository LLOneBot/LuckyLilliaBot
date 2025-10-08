import React from 'react'
import { Config } from '../types'
import { Globe, FileText, Trash2, Music, Lock, Clock, Shield, Edit } from 'lucide-react'

interface OtherConfigProps {
  config: Config;
  onChange: (config: Config) => void;
  onOpenChangePassword: () => void;
}

const OtherConfig: React.FC<OtherConfigProps> = ({ config, onChange, onOpenChangePassword }) => {

  const handleChange = (field: keyof Config, value: any) => {
    onChange({ ...config, [field]: value })
  }

  return (
    <div className='space-y-6'>
      {/* 系统功能 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center'>
            <Globe size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-800'>系统功能</h3>
            <p className='text-sm text-gray-600'>基础功能开关配置</p>
          </div>
        </div>

        <div className='space-y-4'>

          <div
            className='flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors'>
            <div className='flex items-center gap-3'>
              <FileText size={20} className='text-green-600' />
              <div>
                <div className='text-sm font-medium text-gray-800'>日志记录</div>
                <div className='text-xs text-gray-500 mt-0.5'>启用后记录详细的运行日志</div>
              </div>
            </div>
            <input
              type='checkbox'
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
          </div>
          <div
            className='flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors'>
            <div className='flex items-center gap-3'>
              <Globe size={20} className='text-blue-600' />
              <div>
                <div className='text-sm font-medium text-gray-800'>本地文件转URL</div>
                <div className='text-xs text-gray-500 mt-0.5'>启用后可将本地文件转换为URL链接</div>
              </div>
            </div>
            <input
              type='checkbox'
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
          </div>

        </div>
      </div>

      {/* 文件管理 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center'>
            <Trash2 size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-800'>文件管理</h3>
            <p className='text-sm text-gray-600'>自动清理文件相关配置</p>
          </div>
        </div>

        <div className='space-y-4'>
          <div
            className='flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors'>
            <div className='flex items-center gap-3'>
              <Trash2 size={20} className='text-red-600' />
              <div>
                <div className='text-sm font-medium text-gray-800'>自动删除收到的文件</div>
                <div className='text-xs text-gray-500 mt-0.5'>启用后将自动清理接收的临时文件</div>
              </div>
            </div>
            <input
              type='checkbox'
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
          </div>

          {config.autoDeleteFile && (
            <div className='pl-4'>
              <label className='block'>
                <div className='flex items-center gap-2 mb-2'>
                  <Clock size={16} className='text-gray-600' />
                  <span className='text-sm font-medium text-gray-700'>自动删除时间（秒）</span>
                </div>
                <input
                  type='number'
                  value={config.autoDeleteFileSecond}
                  onChange={(e) => handleChange('autoDeleteFileSecond', parseInt(e.target.value))}
                  min='1'
                  max='3600'
                  className='input-field'
                  placeholder='60'
                />
                <p className='text-xs text-gray-500 mt-1'>文件接收后多少秒自动删除（1-3600秒）</p>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 缓存设置 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center'>
            <Clock size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-800'>缓存设置</h3>
            <p className='text-sm text-gray-600'>消息缓存相关配置</p>
          </div>
        </div>

        <label className='block'>
          <div className='flex items-center gap-2 mb-2'>
            <Clock size={16} className='text-purple-600' />
            <span className='text-sm font-medium text-gray-700'>消息缓存过期时间（秒）</span>
          </div>
          <input
            type='number'
            value={config.msgCacheExpire}
            onChange={(e) => handleChange('msgCacheExpire', parseInt(e.target.value))}
            min='1'
            max='86400'
            className='input-field'
            placeholder='3600'
          />
          <p className='text-xs text-gray-500 mt-1'>消息在缓存中保留的时间（1-86400秒）</p>
        </label>
      </div>

      {/* 扩展功能 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center'>
            <Music size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-800'>扩展功能</h3>
            <p className='text-sm text-gray-600'>第三方服务配置</p>
          </div>
        </div>

        <label className='block'>
          <div className='flex items-center gap-2 mb-2'>
            <Music size={16} className='text-green-600' />
            <span className='text-sm font-medium text-gray-700'>音乐签名地址</span>
          </div>
          <input
            type='text'
            value={config.musicSignUrl}
            onChange={(e) => handleChange('musicSignUrl', e.target.value)}
            placeholder='https://example.com/sign'
            className='input-field'
          />
          <p className='text-xs text-gray-500 mt-1'>用于音乐卡片签名的服务地址</p>
        </label>
      </div>

      {/* 安全设置 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div
            className='w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center'>
            <Shield size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-gray-800'>安全设置</h3>
            <p className='text-sm text-gray-600'>WebUI 访问控制</p>
          </div>
        </div>

        <div
          className='flex items-center justify-between p-4 bg-gray-50/50 rounded-xl hover:bg-gray-100/50 transition-colors'>
          <div className='flex items-center gap-3'>
            <Lock size={20} className='text-red-600' />
            <div>
              <div className='text-sm font-medium text-gray-800'>WebUI 访问密码</div>
              <div className='text-xs text-gray-500 mt-0.5'>用于保护 WebUI 访问的密码</div>
            </div>
          </div>
          <button
            onClick={onOpenChangePassword}
            className='px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2'
          >
            <Edit size={16} />
            修改密码
          </button>
        </div>
      </div>
    </div>
  )
}

export default OtherConfig
