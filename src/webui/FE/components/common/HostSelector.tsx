import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { apiFetch } from '../../utils/api'

interface HostSelectorProps {
  value: string
  onChange: (host: string) => void
}

interface Option {
  value: string
  label: string
}

let cachedNetworkInterfaces: string[] | null = null

export const HostSelector: React.FC<HostSelectorProps> = ({ value, onChange }) => {
  const [networkInterfaces, setNetworkInterfaces] = useState<string[]>(cachedNetworkInterfaces || [])
  const [isOpen, setIsOpen] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [customHost, setCustomHost] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!cachedNetworkInterfaces) {
      apiFetch<string[]>('/api/network-interfaces').then(res => {
        if (res.success) {
          cachedNetworkInterfaces = res.data
          setNetworkInterfaces(res.data)
        }
      })
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (value === '' || value === '127.0.0.1' || networkInterfaces.includes(value)) {
      setIsCustom(false)
      setCustomHost('')
    } else if (value) {
      setIsCustom(true)
      setCustomHost(value)
    }
  }, [value, networkInterfaces])

  const options: Option[] = [
    { value: '', label: '全部 (0.0.0.0 和 ::)' },
    { value: '127.0.0.1', label: '仅本地 (127.0.0.1)' },
    ...networkInterfaces.map(ip => ({ value: ip, label: ip })),
  ]

  const getDisplayLabel = () => {
    if (isCustom) return `自定义: ${customHost}`
    const opt = options.find(o => o.value === value)
    return opt?.label || '仅本地 (127.0.0.1)'
  }

  const handleSelect = (opt: Option) => {
    setIsCustom(false)
    setCustomHost('')
    setIsOpen(false)
    onChange(opt.value)
  }

  const handleCustomSelect = () => {
    setIsCustom(true)
    setIsOpen(false)
    if (!customHost) {
      setCustomHost(value || '')
    }
  }

  const handleCustomChange = (val: string) => {
    setCustomHost(val)
    onChange(val)
  }

  return (
    <div className='flex items-center gap-2'>
      <div className='relative flex-1 z-[9999]' ref={dropdownRef}>
        <button
          type='button'
          onClick={() => setIsOpen(!isOpen)}
          className='input-field w-full pr-8 text-left flex items-center justify-between cursor-pointer'
        >
          <span className='truncate'>{getDisplayLabel()}</span>
          <ChevronDown size={16} className={`text-theme-hint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className='absolute z-[9999] mt-1 w-full bg-white dark:bg-neutral-800 border border-theme-divider rounded-xl shadow-lg overflow-hidden'>
            <div className='max-h-60 overflow-y-auto'>
              {options.map((opt, index) => (
                <div
                  key={`${opt.value}-${index}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelect(opt)
                  }}
                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between hover:bg-pink-50 dark:hover:bg-pink-900/30 transition-colors ${
                    !isCustom && value === opt.value ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-600' : 'text-theme'
                  }`}
                >
                  <span>{opt.label}</span>
                  {!isCustom && value === opt.value && <Check size={16} className='text-pink-500' />}
                </div>
              ))}
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleCustomSelect()
                }}
                className={`px-3 py-2.5 cursor-pointer flex items-center justify-between hover:bg-pink-50 dark:hover:bg-pink-900/30 transition-colors border-t border-theme-divider ${
                  isCustom ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-600' : 'text-theme'
                }`}
              >
                <span>自定义</span>
                {isCustom && <Check size={16} className='text-pink-500' />}
              </div>
            </div>
          </div>
        )}
      </div>
      {isCustom && (
        <input
          type='text'
          value={customHost}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder='输入地址'
          className='input-field flex-1'
          autoFocus
        />
      )}
    </div>
  )
}
