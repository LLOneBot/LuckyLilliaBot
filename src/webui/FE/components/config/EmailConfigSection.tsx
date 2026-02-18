import React, { useState } from 'react'
import { Mail, Server, Lock, Send, Loader, BookOpen } from 'lucide-react'
import { testEmail } from '../../utils/emailApi'
import { showToast } from '../common'
import { EmailConfig } from '../../types'

interface EmailConfigSectionProps {
  value: EmailConfig
  onChange: (config: EmailConfig) => void
}

const EmailConfigSection: React.FC<EmailConfigSectionProps> = (props) => {
  const { value, onChange } = props
  const [testing, setTesting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!value.smtp.host.trim()) {
      newErrors.host = 'SMTP 服务器不能为空'
    }

    if (value.smtp.port < 1 || value.smtp.port > 65535) {
      newErrors.port = '端口必须在 1-65535 之间'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!value.from || !emailRegex.test(value.from)) {
      newErrors.from = '发件人邮箱格式不正确'
    }

    if (!value.to || !emailRegex.test(value.to)) {
      newErrors.to = '收件人邮箱格式不正确'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleTest = async () => {
    if (!validateForm()) {
      showToast('请检查表单错误后再测试', 'error')
      return
    }

    try {
      setTesting(true)
      // 如果端口为空，使用默认值 587
      const testConfig = {
        ...value,
        smtp: {
          ...value.smtp,
          port: value.smtp.port || 587
        }
      }
      const result = await testEmail(testConfig)
      showToast(result.message || '测试邮件发送成功', 'success')
    } catch (error: any) {
      showToast(error.message || '测试邮件发送失败', 'error')
    } finally {
      setTesting(false)
    }
  }

  const handleChange = (field: string, newValue: any) => {
    const keys = field.split('.')
    let newConfig = { ...value }
    
    if (keys.length === 1) {
      newConfig = { ...value, [field]: newValue }
    } else if (keys.length === 2) {
      newConfig = {
        ...value,
        [keys[0]]: {
          ...(value as any)[keys[0]],
          [keys[1]]: newValue,
        },
      }
    } else if (keys.length === 3) {
      newConfig = {
        ...value,
        [keys[0]]: {
          ...(value as any)[keys[0]],
          [keys[1]]: {
            ...(value as any)[keys[0]][keys[1]],
            [keys[2]]: newValue,
          },
        },
      }
    }
    
    onChange(newConfig)
    
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' })
    }
  }

  return (
    <div className='card p-6'>
      <div className='flex items-center gap-3 mb-6'>
        <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center'>
          <Mail size={20} className='text-white' />
        </div>
        <div className='flex-1'>
          <h3 className='text-lg font-semibold text-theme'>邮件通知</h3>
          <p className='text-sm text-theme-secondary'>机器人掉线时发送邮件通知</p>
        </div>
        <a
          href='https://luckylillia.com/guide/config_email'
          target='_blank'
          rel='noopener noreferrer'
          className='px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex items-center gap-2'
        >
          <BookOpen size={16} />
          设置向导
        </a>
        <input
          type='checkbox'
          checked={value.enabled}
          onChange={(e) => handleChange('enabled', e.target.checked)}
          className='switch-toggle'
        />
      </div>

      {value.enabled && (
        <div className='space-y-4 border-t border-theme-divider pt-4'>
          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Server size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>SMTP 服务器</span>
            </div>
            <input
              type='text'
              value={value.smtp.host}
              onChange={(e) => handleChange('smtp.host', e.target.value)}
              className={`input-field ${errors.host ? 'border-red-500' : ''}`}
              placeholder='smtp.gmail.com'
            />
            {errors.host && <p className='text-xs text-red-500 mt-1'>{errors.host}</p>}
          </label>

          <div className='grid grid-cols-2 gap-4'>
            <label className='block'>
              <div className='flex items-center gap-2 mb-2'>
                <Server size={16} className='text-blue-600' />
                <span className='text-sm font-medium text-theme-secondary'>端口</span>
              </div>
              <input
                type='number'
                value={value.smtp.port}
                onChange={(e) => {
                  const val = e.target.value
                  handleChange('smtp.port', val === '' ? '' : parseInt(val) || 587)
                }}
                className={`input-field ${errors.port ? 'border-red-500' : ''}`}
                placeholder='587'
                min='1'
                max='65535'
                style={{ appearance: 'textfield' }}
                onWheel={(e) => e.currentTarget.blur()}
              />
              {errors.port && <p className='text-xs text-red-500 mt-1'>{errors.port}</p>}
            </label>

            <label className='block'>
              <div className='flex items-center gap-2 mb-2'>
                <Lock size={16} className='text-blue-600' />
                <span className='text-sm font-medium text-theme-secondary'>加密方式</span>
              </div>
              <select
                value={value.smtp.secure ? 'ssl' : 'starttls'}
                onChange={(e) => {
                  const isSecure = e.target.value === 'ssl'
                  handleChange('smtp.secure', isSecure)
                }}
                className='input-field'
              >
                <option value='starttls'>STARTTLS（常用端口 587）</option>
                <option value='ssl'>SSL/TLS（常用端口 465）</option>
              </select>
              <p className='text-xs text-theme-muted mt-1'>
                {value.smtp.secure ? 'SSL/TLS 直接加密连接' : 'STARTTLS 升级加密连接'}
              </p>
            </label>
          </div>

          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Mail size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>用户名</span>
            </div>
            <input
              type='text'
              value={value.smtp.auth.user}
              onChange={(e) => handleChange('smtp.auth.user', e.target.value)}
              className='input-field'
              placeholder='your-email@gmail.com'
            />
          </label>

          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Lock size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>密码</span>
            </div>
            <input
              type='password'
              value={value.smtp.auth.pass}
              onChange={(e) => handleChange('smtp.auth.pass', e.target.value)}
              className='input-field'
              placeholder='应用专用密码'
            />
            <p className='text-xs text-theme-muted mt-1'>
              建议使用应用专用密码（Gmail、Outlook 等）
            </p>
          </label>

          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Mail size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>发件人邮箱</span>
            </div>
            <input
              type='email'
              value={value.from}
              onChange={(e) => handleChange('from', e.target.value)}
              className={`input-field ${errors.from ? 'border-red-500' : ''}`}
              placeholder='sender@example.com'
            />
            {errors.from && <p className='text-xs text-red-500 mt-1'>{errors.from}</p>}
          </label>

          <label className='block'>
            <div className='flex items-center gap-2 mb-2'>
              <Mail size={16} className='text-blue-600' />
              <span className='text-sm font-medium text-theme-secondary'>收件人邮箱</span>
            </div>
            <input
              type='email'
              value={value.to}
              onChange={(e) => handleChange('to', e.target.value)}
              className={`input-field ${errors.to ? 'border-red-500' : ''}`}
              placeholder='receiver@example.com'
            />
            {errors.to && <p className='text-xs text-red-500 mt-1'>{errors.to}</p>}
          </label>

          <div className='pt-2'>
            <button
              onClick={handleTest}
              disabled={testing}
              className='w-full px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 justify-center
                bg-theme-item hover:bg-theme-item-hover text-theme
                disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {testing ? (
                <>
                  <Loader className='animate-spin' size={16} />
                  发送中...
                </>
              ) : (
                <>
                  <Send size={16} />
                  发送测试邮件
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default EmailConfigSection
