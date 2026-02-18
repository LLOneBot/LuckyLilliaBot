import React from 'react'
import { Config, EmailConfig } from '../../types'
import { Globe, FileText, Trash2, Music, Lock, Clock, Shield, Edit, Paperclip, Server } from 'lucide-react'
import { DurationPicker, HostSelector } from '../common'
import EmailConfigSection from './EmailConfigSection'

interface OtherConfigProps {
  config: Config;
  emailConfig: EmailConfig | null;
  onChange: (config: Config) => void;
  onEmailChange: (emailConfig: EmailConfig) => void;
  onOpenChangePassword: () => void;
}

const OtherConfig: React.FC<OtherConfigProps> = ({ config, emailConfig, onChange, onEmailChange, onOpenChangePassword }) => {
  const handleChange = (field: keyof Config, value: any) => {
    onChange({ ...config, [field]: value })
  }

  const handleEmailChange = (newEmailConfig: EmailConfig) => {
    // 如果端口为空，使用默认值 587
    const normalizedConfig = {
      ...newEmailConfig,
      smtp: {
        ...newEmailConfig.smtp,
        port: newEmailConfig.smtp.port || 587
      }
    }
    onEmailChange(normalizedConfig)
  }

  // 默认邮件配置
  const defaultEmailConfig: EmailConfig = {
    enabled: false,
    smtp: {
      host: '',
      port: 587,
      secure: false,
      auth: {
        user: '',
        pass: '',
      },
    },
    from: '',
    to: '',
  }

  return (
    <div className='space-y-6'>
      {/* WebUI 服务配置 */}
      <div className='card p-6 relative z-[100]'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center'>
            <Server size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>WebUI 服务</h3>
            <p className='text-sm text-theme-secondary'>WebUI 访问地址和端口配置，如果是 Docker 不建议更改此项，否则可能无法访问</p>
          </div>
        </div>

        <div className='space-y-4'>
          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Globe size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>监听地址</span>
            </div>
            <HostSelector 
              value={config.webui?.host ?? '127.0.0.1'} 
              onChange={(host) => {
                onChange({ 
                  ...config, 
                  webui: { 
                    enable: config.webui?.enable ?? true, 
                    port: config.webui?.port || 6099, 
                    host 
                  } 
                });
              }} 
            />
            <p className='text-xs text-theme-muted mt-2'>选择 WebUI 监听的网络地址</p>
          </label>

          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Server size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>端口</span>
            </div>
            <input 
              type='number' 
              value={config.webui?.port || 6099} 
              onChange={(e) => onChange({ 
                ...config, 
                webui: { 
                  enable: config.webui?.enable ?? true, 
                  host: config.webui?.host || '127.0.0.1',
                  port: parseInt(e.target.value) 
                } 
              })} 
              min='1' 
              max='65535' 
              className='input-field' 
              placeholder='6099' 
            />
            <p className='text-xs text-theme-muted mt-1'>WebUI 服务端口（1-65535）</p>
          </label>
        </div>
      </div>

      {/* 邮件通知 */}
      <EmailConfigSection 
        value={emailConfig || defaultEmailConfig} 
        onChange={handleEmailChange} 
      />

      {/* 系统功能 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl gradient-primary-br flex items-center justify-center'>
            <Globe size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>系统功能</h3>
            <p className='text-sm text-theme-secondary'>基础功能开关配置</p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between p-4 bg-theme-item rounded-xl bg-item-hover transition-colors'>
            <div className='flex items-center gap-3'>
              <FileText size={20} className='text-green-600' />
              <div>
                <div className='text-sm font-medium text-theme'>日志记录</div>
                <div className='text-xs text-theme-muted mt-0.5'>启用后记录详细的运行日志</div>
              </div>
            </div>
            <input type='checkbox' checked={config.log} onChange={(e) => handleChange('log', e.target.checked)} className="switch-toggle" />
          </div>
          <div className='flex items-center justify-between p-4 bg-theme-item rounded-xl bg-item-hover transition-colors'>
            <div className='flex items-center gap-3'>
              <Paperclip size={20} className='text-pink-500'/>
              <div>
                <div className='text-sm font-medium text-theme'>本地文件转URL</div>
                <div className='text-xs text-theme-muted mt-0.5'>启用后可将本地文件转换为URL链接</div>
              </div>
            </div>
            <input type='checkbox' checked={config.enableLocalFile2Url} onChange={(e) => handleChange('enableLocalFile2Url', e.target.checked)} className="switch-toggle" />
          </div>
        </div>
      </div>

      {/* 文件管理 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center'>
            <Trash2 size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>文件管理</h3>
            <p className='text-sm text-theme-secondary'>自动清理文件相关配置</p>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between p-4 bg-theme-item rounded-xl bg-item-hover transition-colors'>
            <div className='flex items-center gap-3'>
              <Trash2 size={20} className='text-red-600' />
              <div>
                <div className='text-sm font-medium text-theme'>自动删除收到的文件</div>
                <div className='text-xs text-theme-muted mt-0.5'>启用后将自动清理接收的临时文件</div>
              </div>
            </div>
            <input type='checkbox' checked={config.autoDeleteFile} onChange={(e) => handleChange('autoDeleteFile', e.target.checked)} className="switch-toggle" />
          </div>

          {config.autoDeleteFile && (
            <div className='pl-4'>
              <label className='block'>
                <div className='flex items-center gap-2 mb-2'>
                  <Clock size={16} className='text-theme-secondary' />
                  <span className='text-sm font-medium text-theme-secondary'>自动删除时间（秒）</span>
                </div>
                <input type='number' value={config.autoDeleteFileSecond} onChange={(e) => handleChange('autoDeleteFileSecond', parseInt(e.target.value))} min='1' max='3600' className='input-field' placeholder='60' />
                <p className='text-xs text-theme-muted mt-1'>文件接收后多少秒自动删除（1-3600秒）</p>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 缓存设置 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center'>
            <Clock size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>缓存设置</h3>
            <p className='text-sm text-theme-secondary'>消息缓存相关配置</p>
          </div>
        </div>

        <label className='block'>
          <div className='flex items-center gap-2 mb-2'>
            <Clock size={16} className='text-pink-500' />
            <span className='text-sm font-medium text-theme-secondary'>消息缓存过期时间</span>
          </div>
          <DurationPicker 
            value={config.msgCacheExpire || 120} 
            onChange={(seconds) => handleChange('msgCacheExpire', seconds)} 
            maxDays={1}
            showSeconds={false}
          />
          <p className='text-xs text-theme-muted mt-2'>消息在缓存中保留的时间，最长1天</p>
        </label>
      </div>

      {/* 扩展功能 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center'>
            <Music size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>扩展功能</h3>
            <p className='text-sm text-theme-secondary'>第三方服务配置</p>
          </div>
        </div>

        <label className='block'>
          <div className='flex items-center gap-2 mb-2'>
            <Music size={16} className='text-green-600' />
            <span className='text-sm font-medium text-theme-secondary'>音乐签名地址</span>
          </div>
          <input type='text' value={config.musicSignUrl} onChange={(e) => handleChange('musicSignUrl', e.target.value)} placeholder='https://example.com/sign' className='input-field' />
          <p className='text-xs text-theme-muted mt-1'>用于音乐卡片签名的服务地址</p>
        </label>
      </div>

      {/* 安全设置 */}
      <div className='card p-6'>
        <div className='flex items-center gap-3 mb-6'>
          <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center'>
            <Shield size={20} className='text-white' />
          </div>
          <div>
            <h3 className='text-lg font-semibold text-theme'>安全设置</h3>
            <p className='text-sm text-theme-secondary'>WebUI 访问控制</p>
          </div>
        </div>

        <div className='flex items-center justify-between p-4 bg-theme-item rounded-xl bg-item-hover transition-colors'>
          <div className='flex items-center gap-3'>
            <Lock size={20} className='text-red-600' />
            <div>
              <div className='text-sm font-medium text-theme'>WebUI 访问密码</div>
              <div className='text-xs text-theme-muted mt-0.5'>用于保护 WebUI 访问的密码</div>
            </div>
          </div>
          <button onClick={onOpenChangePassword} className='px-4 py-2 gradient-primary text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2'>
            <Edit size={16} />修改密码
          </button>
        </div>
      </div>
    </div>
  )
}

export default OtherConfig
