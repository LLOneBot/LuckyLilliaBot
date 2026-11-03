import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../utils/api'
import { Select } from './Select'

interface HostSelectorProps {
  value: string
  onChange: (host: string) => void
}

let cachedNetworkInterfaces: string[] | null = null
let cachedIsDocker: boolean = false

// No address is spelled like this, so it can stand for the custom choice in the list
const CUSTOM = '\0custom'

export const HostSelector: React.FC<HostSelectorProps> = ({ value, onChange }) => {
  const [networkInterfaces, setNetworkInterfaces] = useState<string[]>(cachedNetworkInterfaces || [])
  const [isDocker, setIsDocker] = useState(cachedIsDocker)
  const [isCustom, setIsCustom] = useState(false)
  const [customHost, setCustomHost] = useState('')

  useEffect(() => {
    if (!cachedNetworkInterfaces) {
      apiFetch<string[]>('/api/network-interfaces').then(res => {
        if (res.success) {
          cachedNetworkInterfaces = res.data
          cachedIsDocker = !!(res as any).isDocker
          setNetworkInterfaces(res.data)
          setIsDocker(cachedIsDocker)
          if (cachedIsDocker && value !== '') {
            onChange('')
          }
        }
      })
    } else if (isDocker && value !== '') {
      onChange('')
    }
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

  const options = [
    { value: '', label: '全部 (0.0.0.0 和 ::)' },
    { value: '127.0.0.1', label: '仅本地 (127.0.0.1)' },
    ...networkInterfaces.map(ip => ({ value: ip, label: ip })),
    { value: CUSTOM, label: '自定义' },
  ]

  const select = (next: string) => {
    if (next === CUSTOM) {
      setIsCustom(true)
      if (!customHost) setCustomHost(value || '')
      return
    }
    setIsCustom(false)
    setCustomHost('')
    onChange(next)
  }

  const handleCustomChange = (val: string) => {
    setCustomHost(val)
    onChange(val)
  }

  if (isDocker) {
    return (
      <div className='flex items-center gap-2'>
        <div className='input-field w-full text-left opacity-70 cursor-not-allowed'>
          全部 (0.0.0.0 和 ::)
        </div>
      </div>
    )
  }

  return (
    <div className='flex items-center gap-2'>
      <Select value={isCustom ? CUSTOM : value} options={options} onChange={select} className='flex-1 min-w-0' />
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
