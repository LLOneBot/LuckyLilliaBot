import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, X, Filter, ChevronDown, ChevronRight, Code, LayoutList } from 'lucide-react'

const FIELD_OPTIONS = [
  { value: 'post_type', label: '事件类型', type: 'select', options: [
    { value: 'message', label: '消息' },
    { value: 'message_sent', label: '自己发送的消息' },
    { value: 'notice', label: '通知' },
    { value: 'request', label: '请求' },
    { value: 'meta_event', label: '元事件' },
  ]},
  { value: 'message_type', label: '消息类型', type: 'select', options: [
    { value: 'private', label: '私聊' },
    { value: 'group', label: '群聊' },
  ]},
  { value: 'notice_type', label: '通知类型', type: 'select', options: [
    { value: 'group_upload', label: '群文件上传' },
    { value: 'group_admin', label: '群管理员变动' },
    { value: 'group_decrease', label: '群成员减少' },
    { value: 'group_increase', label: '群成员增加' },
    { value: 'group_ban', label: '群禁言' },
    { value: 'group_recall', label: '群消息撤回' },
    { value: 'friend_recall', label: '好友消息撤回' },
    { value: 'notify', label: '群内提示' },
    { value: 'group_card', label: '群名片变更' },
    { value: 'essence', label: '精华消息' },
  ]},
  { value: 'request_type', label: '请求类型', type: 'select', options: [
    { value: 'friend', label: '好友请求' },
    { value: 'group', label: '群请求' },
  ]},
  { value: 'group_id', label: '群号', type: 'number' },
  { value: 'user_id', label: '用户 QQ 号', type: 'number' },
  { value: 'sub_type', label: '子类型', type: 'text' },
  { value: 'raw_message', label: '消息内容', type: 'text' },
] as const

type FieldOption = typeof FIELD_OPTIONS[number]

const OPERATOR_OPTIONS = [
  { value: '$eq', label: '等于' },
  { value: '$ne', label: '不等于' },
  { value: '$in', label: '在列表中' },
  { value: '$nin', label: '不在列表中' },
  { value: '$regex', label: '正则匹配' },
  { value: '$gt', label: '大于' },
  { value: '$lt', label: '小于' },
] as const

interface FilterRule {
  id: number
  field: string
  operator: string
  value: string
}

interface EventFilterEditorProps {
  filter: Record<string, unknown> | undefined
  onChange: (filter: Record<string, unknown> | undefined) => void
}

let nextRuleId = 1

// 从 MongoDB 查询对象解析为可视化规则
function parseFilterToRules(filter: Record<string, unknown>): FilterRule[] | null {
  const rules: FilterRule[] = []
  try {
    for (const [field, condition] of Object.entries(filter)) {
      if (field.startsWith('$')) return null // $and/$or 等复杂查询无法可视化
      if (condition === null || condition === undefined) continue

      if (typeof condition === 'object' && !Array.isArray(condition)) {
        const entries = Object.entries(condition as Record<string, unknown>)
        if (entries.length !== 1) return null
        const [op, val] = entries[0]
        if (!op.startsWith('$')) return null
        const valStr = Array.isArray(val) ? val.join(', ') : String(val ?? '')
        rules.push({ id: nextRuleId++, field, operator: op, value: valStr })
      } else {
        const valStr = Array.isArray(condition) ? condition.join(', ') : String(condition)
        rules.push({ id: nextRuleId++, field, operator: '$eq', value: valStr })
      }
    }
  } catch {
    return null
  }
  return rules
}

function rulesToFilter(rules: FilterRule[]): Record<string, unknown> | undefined {
  if (rules.length === 0) return undefined
  const filter: Record<string, unknown> = {}
  for (const rule of rules) {
    if (!rule.field) continue
    const fieldDef = FIELD_OPTIONS.find(f => f.value === rule.field)
    const isNumeric = fieldDef?.type === 'number'

    let parsedValue: unknown
    if (rule.operator === '$in' || rule.operator === '$nin') {
      parsedValue = rule.value.split(/[,，]/).map(v => {
        const trimmed = v.trim()
        if (!trimmed) return undefined
        return isNumeric ? Number(trimmed) : trimmed
      }).filter(v => v !== undefined && !(isNumeric && isNaN(v as number)))
    } else if (rule.operator === '$regex') {
      parsedValue = rule.value
    } else {
      if (isNumeric) {
        if (rule.value.trim() === '') continue // 跳过空值，不转成 0
        parsedValue = Number(rule.value)
        if (isNaN(parsedValue as number)) continue
      } else {
        parsedValue = rule.value
      }
    }

    if (rule.operator === '$eq') {
      filter[rule.field] = parsedValue
    } else {
      filter[rule.field] = { [rule.operator]: parsedValue }
    }
  }
  return Object.keys(filter).length > 0 ? filter : undefined
}

const EventFilterEditor: React.FC<EventFilterEditorProps> = ({ filter, onChange }) => {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<'visual' | 'json'>('visual')
  const [rules, setRules] = useState<FilterRule[]>([])
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [visualUnsupported, setVisualUnsupported] = useState(false)

  useEffect(() => {
    if (filter && Object.keys(filter).length > 0) {
      setJsonText(JSON.stringify(filter, null, 2))
      const parsed = parseFilterToRules(filter)
      if (parsed) {
        setRules(parsed)
        setVisualUnsupported(false)
      } else {
        setRules([])
        setVisualUnsupported(true)
        setMode('json')
      }
    } else {
      setRules([])
      setJsonText('')
      setVisualUnsupported(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilter = (filter && Object.keys(filter).length > 0) || rules.length > 0

  const updateFromRules = useCallback((newRules: FilterRule[]) => {
    setRules(newRules)
    const newFilter = rulesToFilter(newRules)
    onChange(newFilter)
    setJsonText(newFilter ? JSON.stringify(newFilter, null, 2) : '')
    setJsonError('')
  }, [onChange])

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text)
    const trimmed = text.trim()
    if (!trimmed || trimmed === '{}') {
      setJsonError('')
      onChange(undefined)
      setRules([])
      setVisualUnsupported(false)
      return
    }
    try {
      const parsed = JSON.parse(trimmed)
      setJsonError('')
      onChange(parsed)
      const parsedRules = parseFilterToRules(parsed)
      if (parsedRules) {
        setRules(parsedRules)
        setVisualUnsupported(false)
      } else {
        setVisualUnsupported(true)
      }
    } catch (err) {
      setJsonError((err as Error).message)
    }
  }, [onChange])

  const addRule = () => {
    updateFromRules([...rules, { id: nextRuleId++, field: 'post_type', operator: '$eq', value: '' }])
  }

  const removeRule = (id: number) => {
    updateFromRules(rules.filter(r => r.id !== id))
  }

  const updateRule = (id: number, updates: Partial<FilterRule>) => {
    const newRules = rules.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, ...updates }
      if (updates.field && updates.field !== r.field) {
        updated.value = ''
        updated.operator = '$eq'
      }
      if (updates.operator && updates.operator !== r.operator) {
        const wasListOp = r.operator === '$in' || r.operator === '$nin'
        const isListOp = updates.operator === '$in' || updates.operator === '$nin'
        if (!wasListOp && isListOp) {
          // value 不变, 标签输入会把它当成单项列表
        } else if (wasListOp && !isListOp) {
          const items = r.value.split(/[,，]/).map(v => v.trim()).filter(Boolean)
          updated.value = items[0] || ''
        }
      }
      return updated
    })
    updateFromRules(newRules)
  }

  const switchToMode = (newMode: 'visual' | 'json') => {
    if (newMode === 'visual' && visualUnsupported) return
    if (newMode === 'json' && mode === 'visual') {
      const f = rulesToFilter(rules)
      setJsonText(f ? JSON.stringify(f, null, 2) : '')
    }
    setMode(newMode)
  }

  return (
    <div className="border-t border-theme-divider pt-6">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded
          ? <ChevronDown size={18} className="text-theme-secondary" />
          : <ChevronRight size={18} className="text-theme-secondary" />}
        <Filter size={18} className="text-theme-secondary" />
        <h4 className="text-md font-semibold text-theme">事件过滤器</h4>
        {hasFilter && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-400">
            {rules.length > 0 ? `${rules.length} 条规则` : '已配置'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* 模式切换 */}
          <div className="flex gap-1 p-1 bg-theme-item rounded-xl w-fit">
            <button
              type="button"
              onClick={() => switchToMode('visual')}
              disabled={visualUnsupported}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'visual'
                  ? 'bg-white dark:bg-neutral-700 text-theme shadow-sm'
                  : visualUnsupported
                    ? 'text-theme-hint cursor-not-allowed'
                    : 'text-theme-secondary hover:text-theme'
              }`}
            >
              <LayoutList size={14} />
              可视化
            </button>
            <button
              type="button"
              onClick={() => switchToMode('json')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === 'json'
                  ? 'bg-white dark:bg-neutral-700 text-theme shadow-sm'
                  : 'text-theme-secondary hover:text-theme'
              }`}
            >
              <Code size={14} />
              JSON
            </button>
          </div>

          {visualUnsupported && mode === 'json' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              当前过滤器包含复杂查询（$and/$or 等），仅支持 JSON 编辑
            </p>
          )}

          {/* 可视化模式 */}
          {mode === 'visual' && (
            <div className="space-y-3">
              {rules.length === 0 && (
                <p className="text-sm text-theme-hint py-3 text-center">
                  未配置过滤规则，将接收所有事件
                </p>
              )}

              {rules.length > 0 && (
                <div className="text-xs text-theme-hint px-1 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  只有符合以下规则的事件才会被上报{rules.length > 1 && <span>，规则之间为 <span className="font-semibold text-pink-500">且 (AND)</span> 的关系</span>}
                </div>
              )}

              {rules.map((rule, idx) => {
                const fieldDef = FIELD_OPTIONS.find(f => f.value === rule.field)
                const isListOp = rule.operator === '$in' || rule.operator === '$nin'
                const listValues = isListOp
                  ? rule.value.split(/[,，]/).map(v => v.trim()).filter(Boolean)
                  : []

                return (
                  <div key={rule.id} className="p-3 bg-theme-item rounded-xl space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-[1fr_auto] gap-2 items-start">
                        {/* 字段选择 */}
                        <select
                          value={rule.field}
                          onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                          className="input-field text-sm !py-2"
                        >
                          {FIELD_OPTIONS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>

                        {/* 操作符选择 */}
                        <select
                          value={rule.operator}
                          onChange={(e) => updateRule(rule.id, { operator: e.target.value })}
                          className="input-field text-sm !py-2 !w-auto"
                        >
                          {OPERATOR_OPTIONS.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRule(rule.id)}
                        className="p-2 text-theme-hint hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* 值输入 */}
                    {isListOp ? (
                      /* 标签式列表输入 */
                      <div className="space-y-2">
                        {listValues.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {listValues.map((val, vi) => (
                              <span
                                key={vi}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 rounded-lg"
                              >
                                {fieldDef && 'options' in fieldDef
                                  ? (fieldDef.options.find(o => o.value === val)?.label ?? val)
                                  : val}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = listValues.filter((_, i) => i !== vi)
                                    updateRule(rule.id, { value: newList.join(', ') })
                                  }}
                                  className="hover:text-pink-900 dark:hover:text-pink-100 transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {fieldDef && 'options' in fieldDef ? (
                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return
                              if (listValues.includes(e.target.value)) return
                              const newList = [...listValues, e.target.value]
                              updateRule(rule.id, { value: newList.join(', ') })
                            }}
                            className="input-field text-sm !py-2"
                          >
                            <option value="">点击添加...</option>
                            {fieldDef.options
                              .filter(opt => !listValues.includes(opt.value))
                              .map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                          </select>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type={fieldDef?.type === 'number' ? 'number' : 'text'}
                              placeholder={fieldDef?.type === 'number' ? '输入数字后按回车添加' : '输入值后按回车添加'}
                              className="input-field text-sm !py-2 flex-1"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                e.preventDefault()
                                const input = e.currentTarget
                                const val = input.value.trim()
                                if (!val) return
                                if (listValues.includes(val)) { input.value = ''; return }
                                const newList = [...listValues, val]
                                updateRule(rule.id, { value: newList.join(', ') })
                                input.value = ''
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : fieldDef && 'options' in fieldDef ? (
                      <select
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        className="input-field text-sm !py-2"
                      >
                        <option value="">请选择</option>
                        {fieldDef.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={fieldDef?.type === 'number' ? 'number' : 'text'}
                        value={rule.value}
                        onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                        placeholder={
                          rule.operator === '$regex' ? '正则表达式'
                          : fieldDef?.type === 'number' ? '输入数字'
                          : '输入值'
                        }
                        className="input-field text-sm !py-2"
                      />
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 rounded-xl transition-colors"
              >
                <Plus size={16} />
                添加规则
              </button>
            </div>
          )}

          {/* JSON 模式 */}
          {mode === 'json' && (
            <div className="space-y-2">
              <textarea
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                placeholder='{ "post_type": "message", "message_type": "group" }'
                rows={6}
                spellCheck={false}
                className={`input-field font-mono text-sm resize-y ${jsonError ? 'ring-2 ring-red-500 border-red-500' : ''}`}
              />
              {jsonError && (
                <p className="text-xs text-red-500">{jsonError}</p>
              )}
              <p className="text-xs text-theme-hint leading-relaxed">
                只有符合过滤器的事件才会被上报，留空表示接收所有事件。
                MongoDB 查询语法，支持：$eq, $ne, $in, $nin, $gt, $lt, $regex, $and, $or, $not
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default EventFilterEditor
