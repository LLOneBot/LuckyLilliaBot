import React, { createContext, useContext, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { SchemaNode } from './model'

interface InputProps<T> {
  node: SchemaNode
  value: T | undefined
  onChange: (value: T | undefined) => void
  invalid?: boolean
  path?: string[]
}

/** What the bot sends in place of a stored secret (SECRET_MASK in src/plugin/host/index.ts). */
export const SECRET_MASK = '********'

/** Given by a form that can empty a stored secret: sending the mask or nothing back keeps it. */
export const SecretClearContext = createContext<((path: string) => void) | undefined>(undefined)

const invalidRing = 'border-red-400 focus:ring-red-500'

export function StringInput({ node, value, onChange, invalid, path = [] }: InputProps<string>) {
  const [reveal, setReveal] = useState(false)
  const [cleared, setCleared] = useState(false)
  const clear = useContext(SecretClearContext)
  const { role, pattern, extra } = node.meta
  const text = value ?? ''
  const mismatch = !!pattern && text !== '' && !new RegExp(pattern.source, pattern.flags).test(text)
  const className = `input-field ${invalid || mismatch ? invalidRing : ''}`

  if (role === 'textarea') {
    const rows = Array.isArray(extra?.rows) ? extra.rows[0] : 3
    return <textarea value={text} rows={rows} onChange={e => onChange(e.target.value)} className={`${className} resize-y`} />
  }
  if (role === 'secret') {
    const stored = text === SECRET_MASK
    return (
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            type={reveal && !stored ? 'text' : 'password'}
            value={text}
            placeholder={cleared ? '保存后清空已存的值' : undefined}
            // The stored one is selected, so typing replaces it
            onFocus={e => stored && e.target.select()}
            onChange={e => onChange(e.target.value)}
            className={`${className} pr-12`}
          />
          {!stored && (
            <button type="button" onClick={() => setReveal(!reveal)} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-hint hover:text-theme transition-colors p-1">
              {reveal ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          )}
        </div>
        {stored && clear && (
          <button type="button" onClick={() => { clear(path.join('.')); setCleared(true); onChange('') }} className="btn-glass text-sm flex-shrink-0">
            清空
          </button>
        )}
      </div>
    )
  }
  return <input type="text" value={text} onChange={e => onChange(e.target.value)} className={className} />
}

export function NumberInput({ node, value, onChange, invalid }: InputProps<number>) {
  const { min, max, step, role } = node.meta
  const parse = (raw: string) => (raw === '' ? undefined : Number(raw))
  if (role === 'slider' && min !== undefined && max !== undefined) {
    // Schema.percent() is a 0-1 slider
    const label = value === undefined ? '-' : min === 0 && max === 1 ? `${Math.round(value * 100)}%` : value
    return (
      <div className="flex items-center gap-3">
        <input type="range" min={min} max={max} step={step ?? 'any'} value={value ?? min} onChange={e => onChange(parse(e.target.value))} className="flex-1 min-w-0 accent-pink-500" />
        <span className="w-12 text-right text-sm text-theme tnum">{label}</span>
      </div>
    )
  }
  return (
    <input type="number" min={min} max={max} step={step ?? 'any'} value={value ?? ''} onChange={e => onChange(parse(e.target.value))} className={`input-field ${invalid ? invalidRing : ''}`} />
  )
}

const UNITS = [
  { label: '毫秒', factor: 1 },
  { label: '秒', factor: 1000 },
  { label: '分钟', factor: 60_000 },
  { label: '小时', factor: 3_600_000 },
  { label: '天', factor: 86_400_000 },
]

/** Schema role 'ms': stored in milliseconds, edited in the largest unit that divides it. */
export function DurationInput({ value, onChange, invalid }: InputProps<number>) {
  const fit = (ms: number | undefined) => [...UNITS].reverse().find(unit => ms !== undefined && ms !== 0 && ms % unit.factor === 0) ?? UNITS[1]
  const [unit, setUnit] = useState(() => fit(value))
  useEffect(() => {
    if (value !== undefined && value % unit.factor !== 0) setUnit(fit(value))
  }, [value])
  return (
    <div className="flex gap-2">
      <input
        type="number"
        min={0}
        step="any"
        value={value === undefined ? '' : value / unit.factor}
        onChange={e => onChange(e.target.value === '' ? undefined : Math.round(Number(e.target.value) * unit.factor))}
        className={`input-field flex-1 ${invalid ? invalidRing : ''}`}
      />
      <select value={unit.factor} onChange={e => setUnit(UNITS.find(item => item.factor === Number(e.target.value))!)} className="input-field w-28">
        {UNITS.map(item => <option key={item.factor} value={item.factor}>{item.label}</option>)}
      </select>
    </div>
  )
}

export function Switch({ value, onChange, disabled }: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <input type="checkbox" checked={value} disabled={disabled} onChange={e => onChange(e.target.checked)} className="switch-toggle" />
}

export function ChoiceInput({ options, value, onChange, radio, invalid }: {
  options: { value: unknown; label: string }[]
  value: unknown
  onChange: (value: unknown) => void
  radio?: boolean
  invalid?: boolean
}) {
  const index = options.findIndex(option => option.value === value)
  if (radio) {
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-theme-secondary">
        {options.map((option, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={i === index} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    )
  }
  return (
    <select value={index} onChange={e => onChange(options[Number(e.target.value)]?.value)} className={`input-field ${invalid ? invalidRing : ''}`}>
      {index < 0 && <option value={-1}>请选择</option>}
      {options.map((option, i) => <option key={i} value={i}>{option.label}</option>)}
    </select>
  )
}

/** Fallback for schemas a form cannot express field by field. */
export function JsonInput({ value, onChange, invalid }: { value: unknown; onChange: (value: unknown) => void; invalid?: boolean }) {
  const serialize = (input: unknown) => (input === undefined ? '' : JSON.stringify(input, null, 2))
  const [text, setText] = useState(() => serialize(value))
  const [parseError, setParseError] = useState('')
  useEffect(() => {
    setText(serialize(value))
  }, [value])

  const commit = () => {
    if (!text.trim()) {
      setParseError('')
      onChange(undefined)
      return
    }
    try {
      onChange(JSON.parse(text))
      setParseError('')
    } catch (e) {
      setParseError((e as Error).message)
    }
  }

  return (
    <div>
      <textarea
        value={text}
        rows={Math.min(12, Math.max(3, text.split('\n').length))}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        className={`input-field font-mono text-sm resize-y ${invalid || parseError ? invalidRing : ''}`}
      />
      {parseError && <p className="text-xs text-red-500 mt-1">JSON 格式错误：{parseError}</p>}
    </div>
  )
}
