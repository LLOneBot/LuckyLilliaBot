import React, { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { classifyUnion, localize, mergeIntersect, SchemaNode } from './model'
import { initialValue, isPlainObject } from './values'
import { ChoiceInput, DurationInput, JsonInput, NumberInput, StringInput, Switch } from './inputs'
import { HostSelector } from '../../common/HostSelector'
import { PluginBoundary } from '../../../plugin-host/context'
import { useFieldRenderer } from '../../../plugin-host/views'

export interface FieldProps {
  node: SchemaNode
  value: unknown
  onChange: (value: unknown) => void
  path: string[]
  /** Backend validation messages keyed by dotted path. */
  errors: Record<string, string>
  depth: number
}

// Past this depth a self-referencing (lazy) schema is edited as JSON instead of nesting forever
const MAX_DEPTH = 6

const errorAt = (errors: Record<string, string>, path: string[]) => errors[path.join('.')]

// Roles this form renders itself; plugins register field renderers for other roles only
const BUILTIN_ROLES = new Set(['ms', 'table', 'radio', 'checkbox', 'secret', 'slider', 'textarea', 'host'])

const iconButton = 'p-1.5 text-theme-muted hover:text-theme hover:bg-theme-item rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none'

export function SchemaField(props: FieldProps) {
  const { node, value, onChange, path, errors, depth } = props
  const role = node.meta.role
  const custom = useFieldRenderer(role && !BUILTIN_ROLES.has(role) ? role : undefined)
  const invalid = !!errorAt(errors, path)
  if (custom) {
    const { owner, component: Field } = custom
    return (
      <PluginBoundary owner={owner}>
        <Field value={value} onChange={onChange} meta={node.meta} error={errorAt(errors, path)} />
      </PluginBoundary>
    )
  }
  if (depth > MAX_DEPTH) return <JsonInput value={value} onChange={onChange} invalid={invalid} />

  switch (node.type) {
    case 'string':
      return node.meta.role === 'host'
        ? <HostSelector value={(value as string | undefined) ?? ''} onChange={onChange} />
        : <StringInput node={node} value={value as string} onChange={onChange} invalid={invalid} path={path} />
    case 'number':
      return node.meta.role === 'ms'
        ? <DurationInput node={node} value={value as number} onChange={onChange} invalid={invalid} />
        : <NumberInput node={node} value={value as number} onChange={onChange} invalid={invalid} />
    case 'boolean':
      return <Switch value={!!value} onChange={onChange} />
    case 'const':
      return <span className="inline-block text-xs px-3 py-1 rounded-full bg-theme-item text-theme-secondary">{String(node.value)}</span>
    case 'transform':
      return node.inner ? <SchemaField {...props} node={node.inner} /> : <JsonInput value={value} onChange={onChange} invalid={invalid} />
    case 'object':
      return <ObjectField {...props} />
    case 'intersect': {
      const merged = mergeIntersect(node)
      return merged ? <ObjectField {...props} node={merged} /> : <JsonInput value={value} onChange={onChange} invalid={invalid} />
    }
    case 'array':
      return <ArrayField {...props} />
    case 'tuple':
      return <TupleField {...props} />
    case 'dict':
      return <DictField {...props} />
    case 'union':
      return <UnionField {...props} />
    case 'bitset':
      return <BitsetField {...props} />
    default:
      return <JsonInput value={value} onChange={onChange} invalid={invalid} />
  }
}

/** The branch description of a false-or-object union labels the "on" choice, not a section. */
function untitled(node: SchemaNode): SchemaNode {
  return { ...node, meta: { ...node.meta, description: undefined } }
}

/** Fields whose control sits on the label row instead of under it. */
function isInline(node: SchemaNode) {
  return node.type === 'boolean' || (node.type === 'union' && classifyUnion(node).kind === 'toggle')
}

function Badges({ node }: { node: SchemaNode }) {
  const tone: Record<string, string> = {
    danger: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    warning: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  }
  return (
    <>
      {node.meta.badges?.map(badge => (
        <span key={badge.text} className={`text-[11px] px-2 py-0.5 rounded-full ${tone[badge.type] ?? 'bg-theme-item text-theme-secondary'}`}>
          {badge.text}
        </span>
      ))}
    </>
  )
}

export function FieldRow({ name, node, error, children }: { name?: string; node: SchemaNode; error?: string; children: React.ReactNode }) {
  const description = localize(node.meta.description)
  const title = (
    <div className="text-sm font-medium text-theme-secondary flex items-center gap-2 flex-wrap">
      {/* The key only on hover: next to the description it reads as jargon */}
      <span title={description && name ? name : undefined}>{description ?? name}</span>
      {node.meta.required && <span className="text-red-500">*</span>}
      <Badges node={node} />
    </div>
  )
  return (
    <div>
      {isInline(node) ? (
        <div className="flex items-center justify-between gap-4">
          {title}
          {children}
        </div>
      ) : (
        <>
          <div className="mb-2">{title}</div>
          {children}
        </>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function ObjectField({ node, value, onChange, path, errors, depth }: FieldProps) {
  const [open, setOpen] = useState(!node.meta.collapse)
  const current = isPlainObject(value) ? value : {}
  const entries = Object.entries(node.dict ?? {}).filter(([, child]) => !child.meta.hidden)

  const body = (
    <div className="space-y-5">
      {entries.map(([key, child]) => {
        const childPath = [...path, key]
        const update = (next: unknown) => onChange({ ...current, [key]: next })
        // A false-or-object union reads as a switch with the object folded out under it
        const view = child.type === 'union' ? classifyUnion(child) : undefined
        if (view?.kind === 'toggle') {
          const on = current[key] !== false && current[key] !== undefined
          return (
            <div key={key} className="space-y-3">
              <FieldRow name={key} node={child} error={errorAt(errors, childPath)}>
                <Switch value={on} onChange={checked => update(checked ? initialValue(view.on) : false)} />
              </FieldRow>
              {on && <SchemaField node={untitled(view.on)} value={current[key]} onChange={update} path={childPath} errors={errors} depth={depth + 1} />}
            </div>
          )
        }
        // A nested object is a box with its title on it; a label above would say the same again
        if (child.type === 'object') {
          return (
            <div key={key}>
              <SchemaField node={child} value={current[key]} onChange={update} path={childPath} errors={errors} depth={depth + 1} />
              {errorAt(errors, childPath) && <p className="text-xs text-red-500 mt-1">{errorAt(errors, childPath)}</p>}
            </div>
          )
        }
        return (
          <FieldRow key={key} name={key} node={child} error={errorAt(errors, childPath)}>
            <SchemaField node={child} value={current[key]} onChange={update} path={childPath} errors={errors} depth={depth + 1} />
          </FieldRow>
        )
      })}
    </div>
  )

  if (depth === 0) return body
  const title = localize(node.meta.description)
  return (
    <div className="rounded-xl border border-theme-divider">
      {(title || node.meta.collapse) && (
        <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-theme-secondary">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {title ?? '展开'}
        </button>
      )}
      {open && <div className={`p-4 ${title || node.meta.collapse ? 'pt-1' : ''}`}>{body}</div>}
    </div>
  )
}

/** Stable React keys for list items that survive removal and reordering. */
function useItemKeys(length: number) {
  const counter = useRef(0)
  const keys = useRef<number[]>([])
  while (keys.current.length < length) keys.current.push(counter.current++)
  if (keys.current.length > length) keys.current.length = length
  return keys
}

function ArrayField({ node, value, onChange, path, errors, depth }: FieldProps) {
  const items = Array.isArray(value) ? value : []
  const inner = node.inner ?? { type: 'any', meta: {} }
  const keys = useItemKeys(items.length)
  const view = inner.type === 'union' ? classifyUnion(inner) : undefined

  // An array of constants is a multi-select
  if (view?.kind === 'select') {
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-theme-secondary">
        {view.options.map((option, index) => (
          <label key={index} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={items.includes(option.value)}
              onChange={e => onChange(e.target.checked ? [...items, option.value] : items.filter(item => item !== option.value))}
            />
            {option.label}
          </label>
        ))}
      </div>
    )
  }

  const move = (from: number, to: number) => {
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    const [key] = keys.current.splice(from, 1)
    keys.current.splice(to, 0, key)
    onChange(next)
  }
  const remove = (index: number) => {
    keys.current.splice(index, 1)
    onChange(items.filter((_, i) => i !== index))
  }
  const actions = (index: number) => (
    <div className="flex items-center flex-shrink-0">
      <button type="button" title="上移" disabled={index === 0} onClick={() => move(index, index - 1)} className={iconButton}><ArrowUp size={16} /></button>
      <button type="button" title="下移" disabled={index === items.length - 1} onClick={() => move(index, index + 1)} className={iconButton}><ArrowDown size={16} /></button>
      <button type="button" title="删除" onClick={() => remove(index)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={16} /></button>
    </div>
  )
  const addButton = (
    <button type="button" onClick={() => onChange([...items, initialValue(inner)])} className="flex items-center gap-2 px-4 py-2 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors text-sm font-medium">
      <Plus size={18} />
      添加
    </button>
  )

  // role 'table' on an array of flat objects: one row per item, one column per key
  const columns = node.meta.role === 'table' && inner.type === 'object' ? Object.entries(inner.dict ?? {}).filter(([, child]) => !child.meta.hidden) : undefined
  if (columns) {
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="text-left text-theme-muted">
                {columns.map(([key, child]) => <th key={key} className="font-medium px-2 py-1">{localize(child.meta.description) ?? key}</th>)}
                <th className="w-[6.5rem]" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const row = isPlainObject(item) ? item : {}
                return (
                  <tr key={keys.current[index]} className="align-top">
                    {columns.map(([key, child]) => (
                      <td key={key} className="px-2 py-1">
                        <SchemaField
                          node={child}
                          value={row[key]}
                          onChange={next => onChange(items.map((old, i) => (i === index ? { ...row, [key]: next } : old)))}
                          path={[...path, String(index), key]}
                          errors={errors}
                          depth={depth + 2}
                        />
                        {errorAt(errors, [...path, String(index), key]) && <p className="text-xs text-red-500 mt-1">{errorAt(errors, [...path, String(index), key])}</p>}
                      </td>
                    ))}
                    <td className="px-1 py-1">{actions(index)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {addButton}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={keys.current[index]} className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <SchemaField
              node={inner}
              value={item}
              onChange={next => onChange(items.map((old, i) => (i === index ? next : old)))}
              path={[...path, String(index)]}
              errors={errors}
              depth={depth + 1}
            />
          </div>
          {actions(index)}
        </div>
      ))}
      {addButton}
    </div>
  )
}

function TupleField({ node, value, onChange, path, errors, depth }: FieldProps) {
  const items = Array.isArray(value) ? value : []
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, node.list?.length ?? 1)}, minmax(0, 1fr))` }}>
      {(node.list ?? []).map((child, index) => (
        <SchemaField
          key={index}
          node={child}
          value={items[index]}
          onChange={next => {
            const copy = [...items]
            copy[index] = next
            onChange(copy)
          }}
          path={[...path, String(index)]}
          errors={errors}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

function DictField({ node, value, onChange, path, errors, depth }: FieldProps) {
  const current = isPlainObject(value) ? value : {}
  const inner = node.inner ?? { type: 'any', meta: {} }
  const keyView = node.sKey?.type === 'union' ? classifyUnion(node.sKey) : undefined
  const keyOptions = keyView?.kind === 'select' ? keyView.options : undefined
  const entries = Object.entries(current)

  const rename = (from: string, to: string) => {
    if (to === from || to in current) return
    onChange(Object.fromEntries(entries.map(([key, item]) => [key === from ? to : key, item])))
  }
  const add = () => {
    const free = keyOptions
      ? keyOptions.map(option => String(option.value)).find(key => !(key in current))
      : (() => { let i = entries.length + 1; while (`key${i}` in current) i++; return `key${i}` })()
    if (free !== undefined) onChange({ ...current, [free]: initialValue(inner) })
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, item]) => (
        <div key={key} className="flex items-start gap-2">
          {keyOptions ? (
            <div className="w-40 flex-shrink-0">
              <ChoiceInput options={keyOptions} value={key} onChange={next => rename(key, String(next))} />
            </div>
          ) : (
            <input type="text" defaultValue={key} onBlur={e => rename(key, e.target.value.trim() || key)} className="input-field w-40 flex-shrink-0 font-mono text-sm" />
          )}
          <div className="flex-1 min-w-0">
            <SchemaField node={inner} value={item} onChange={next => onChange({ ...current, [key]: next })} path={[...path, key]} errors={errors} depth={depth + 1} />
          </div>
          <button
            type="button"
            title="删除"
            onClick={() => onChange(Object.fromEntries(entries.filter(([other]) => other !== key)))}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-2 px-4 py-2 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-lg transition-colors text-sm font-medium">
        <Plus size={18} />
        添加
      </button>
    </div>
  )
}

function UnionField(props: FieldProps) {
  const { node, value, onChange, path, errors, depth } = props
  const view = classifyUnion(node)
  const invalid = !!errorAt(errors, path)
  switch (view.kind) {
    case 'select':
      return <ChoiceInput options={view.options} value={value} onChange={onChange} radio={node.meta.role === 'radio'} invalid={invalid} />
    case 'single':
    case 'optional':
      return <SchemaField {...props} node={view.inner} />
    case 'toggle': {
      const on = value !== false && value !== undefined
      return (
        <div className="space-y-3">
          <Switch value={on} onChange={checked => onChange(checked ? initialValue(view.on) : false)} />
          {on && <SchemaField {...props} node={untitled(view.on)} depth={depth + 1} />}
        </div>
      )
    }
    case 'tagged': {
      const current = isPlainObject(value) ? value : {}
      const selected = view.branches.find(branch => branch.value === current[view.key]) ?? view.branches[0]
      // The tag key is chosen with the buttons, so it is left out of the branch's own fields
      const rest: SchemaNode = { ...selected.node, dict: Object.fromEntries(Object.entries(selected.node.dict ?? {}).filter(([key]) => key !== view.key)) }
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {view.branches.map((branch, index) => (
              <button
                key={index}
                type="button"
                onClick={() => branch !== selected && onChange({ ...(initialValue(branch.node) as object), [view.key]: branch.value })}
                className={`px-4 py-1.5 r-capsule text-sm font-medium transition-colors ${branch === selected ? 'gradient-primary text-white' : 'bg-theme-item text-theme-secondary hover:bg-theme-item-hover'}`}
              >
                {branch.label}
              </button>
            ))}
          </div>
          <SchemaField node={rest} value={current} onChange={next => onChange({ ...(next as object), [view.key]: selected.value })} path={path} errors={errors} depth={depth + 1} />
        </div>
      )
    }
    default:
      return <JsonInput value={value} onChange={onChange} invalid={invalid} />
  }
}

function BitsetField({ node, value, onChange }: FieldProps) {
  const bits = node.bits ?? {}
  // schemastery accepts either the number or the list of flag names, and outputs the number
  const mask = typeof value === 'number'
    ? value
    : Array.isArray(value) ? value.reduce((sum: number, name) => sum | (bits[name as string] ?? 0), 0) : 0
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-theme-secondary">
      {Object.entries(bits).map(([name, bit]) => (
        <label key={name} className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={(mask & bit) !== 0} onChange={e => onChange(e.target.checked ? mask | bit : mask & ~bit)} />
          {name}
        </label>
      ))}
    </div>
  )
}
