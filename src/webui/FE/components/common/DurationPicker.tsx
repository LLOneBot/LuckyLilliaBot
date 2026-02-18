import React, { useState, useEffect } from 'react'

interface DurationPickerProps {
  value: number // 秒
  onChange: (seconds: number) => void
  maxDays?: number
  showSeconds?: boolean
}

export const DurationPicker: React.FC<DurationPickerProps> = ({ 
  value, 
  onChange, 
  maxDays = 1,
  showSeconds = true 
}) => {
  const [seconds, setSeconds] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [hours, setHours] = useState(0)
  const [days, setDays] = useState(0)

  useEffect(() => {
    let remaining = value || 0
    const d = Math.floor(remaining / 86400)
    remaining %= 86400
    const h = Math.floor(remaining / 3600)
    remaining %= 3600
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    setDays(d)
    setHours(h)
    setMinutes(m)
    setSeconds(s)
  }, [value])

  const updateValue = (d: number, h: number, m: number, s: number) => {
    const total = s + m * 60 + h * 3600 + d * 86400
    onChange(total)
  }

  const handleDaysChange = (v: number) => {
    const newDays = Math.min(maxDays, Math.max(0, v))
    setDays(newDays)
    updateValue(newDays, hours, minutes, seconds)
  }

  const handleHoursChange = (v: number) => {
    const newHours = Math.min(23, Math.max(0, v))
    setHours(newHours)
    updateValue(days, newHours, minutes, seconds)
  }

  const handleMinutesChange = (v: number) => {
    const newMinutes = Math.min(59, Math.max(0, v))
    setMinutes(newMinutes)
    updateValue(days, hours, newMinutes, seconds)
  }

  const handleSecondsChange = (v: number) => {
    const newSeconds = Math.min(59, Math.max(0, v))
    setSeconds(newSeconds)
    updateValue(days, hours, minutes, newSeconds)
  }

  const cols = showSeconds ? 4 : 3
  const inputClassName = "w-full px-2 py-2 text-center bg-theme-input border border-theme-input rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-pink-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {maxDays > 0 && (
        <div className="flex flex-col items-center">
          <input
            type="number"
            min={0}
            max={maxDays}
            value={days}
            onChange={(e) => handleDaysChange(parseInt(e.target.value) || 0)}
            className={inputClassName}
          />
          <span className="text-xs text-theme-secondary mt-1">天</span>
        </div>
      )}
      <div className="flex flex-col items-center">
        <input
          type="number"
          min={0}
          max={23}
          value={hours}
          onChange={(e) => handleHoursChange(parseInt(e.target.value) || 0)}
          className={inputClassName}
        />
        <span className="text-xs text-theme-secondary mt-1">小时</span>
      </div>
      <div className="flex flex-col items-center">
        <input
          type="number"
          min={0}
          max={59}
          value={minutes}
          onChange={(e) => handleMinutesChange(parseInt(e.target.value) || 0)}
          className={inputClassName}
        />
        <span className="text-xs text-theme-secondary mt-1">分钟</span>
      </div>
      {showSeconds && (
        <div className="flex flex-col items-center">
          <input
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => handleSecondsChange(parseInt(e.target.value) || 0)}
            className={inputClassName}
          />
          <span className="text-xs text-theme-secondary mt-1">秒</span>
        </div>
      )}
    </div>
  )
}
