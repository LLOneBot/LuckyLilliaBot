import React, { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SelectInput, useBots } from '@luckylillia/plugin-sdk/webui'
import { formatOwner, parseOwner, type OwnerRow } from './owners'

interface OwnerEditorProps {
  value: string[]
  onChange(value: string[]): void
  disabled: boolean
  errors: Record<string, string>
}

const PLATFORM_LABEL: Record<string, string> = { '': '全部平台', ntqq: 'NTQQ', qq: 'QQ 官方机器人' }

export const OwnerEditor: React.FC<OwnerEditorProps> = ({ value, onChange, disabled, errors }) => {
  const bots = useBots() ?? []
  const container = useRef<HTMLFieldSetElement>(null)
  const rows = value.map(parseOwner)
  const platforms = [...new Set(['', 'ntqq', 'qq', ...bots.map(bot => bot.platform), ...rows.map(row => row.platform)])]
  const options = platforms.map(platform => ({ value: platform, label: PLATFORM_LABEL[platform] ?? platform }))
  const change = (index: number, patch: Partial<OwnerRow>) => {
    onChange(rows.map((row, i) => formatOwner(i === index ? { ...row, ...patch } : row)))
  }

  return (
    <fieldset ref={container} disabled={disabled} className="min-w-0 space-y-2 disabled:opacity-60">
      <legend className="mb-1 text-sm font-medium text-theme">主人</legend>
      <p className="text-xs text-theme-muted">主人可以使用所有指令。每行选择平台并填写用户 ID；NTQQ 填 QQ 号，QQ 官方机器人填用户 openid。选择“全部平台”时匹配所有平台的该用户 ID。</p>
      {rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2rem] items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)_2rem]">
          <span className="text-xs text-theme-muted">平台</span>
          <span className="text-xs text-theme-muted">用户 ID</span>
          <span />
          {rows.map((row, index) => (
            <React.Fragment key={index}>
              <SelectInput
                value={row.platform}
                options={options}
                onChange={platform => change(index, { platform })}
                disabled={disabled}
                className="min-w-0 w-full px-2 py-1.5 text-sm"
              />
              <input
                value={row.userId}
                onChange={event => change(index, { userId: event.target.value })}
                aria-label={`主人 ${index + 1} 的用户 ID`}
                aria-invalid={!!errors[`owners.${index}`]}
                placeholder={row.platform === 'ntqq' ? 'QQ 号' : row.platform === 'qq' ? '用户 openid' : '用户 ID'}
                className="input-field min-w-0 px-2 py-1.5 text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                aria-label={`删除主人 ${index + 1}`}
                title="删除主人"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted transition-colors hover:bg-theme-item hover:text-red-500"
              >
                <Trash2 size={15} />
              </button>
              {errors[`owners.${index}`] && <p className="col-span-3 text-xs text-red-500" role="alert">{errors[`owners.${index}`]}</p>}
            </React.Fragment>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          onChange([...value, ''])
          requestAnimationFrame(() => container.current?.querySelectorAll('input')[rows.length]?.focus())
        }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-theme-secondary transition-colors hover:bg-theme-item hover:text-theme"
      >
        <Plus size={14} />添加主人
      </button>
      {errors.owners && <p className="text-xs text-red-500" role="alert">{errors.owners}</p>}
    </fieldset>
  )
}
