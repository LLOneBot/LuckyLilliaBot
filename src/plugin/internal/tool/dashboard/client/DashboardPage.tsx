import React from 'react'
import { Icon, Slot, type DashboardCardOptions } from '@luckylillia/plugin-sdk/webui'
import { GLYPH } from './cards'

const CARD_SIZE: Record<NonNullable<DashboardCardOptions['size']>, string> = {
  normal: 'basis-72 grow',
  wide: 'basis-[37rem] grow-[2]',
  full: 'basis-full',
}

/**
 * The card around a contribution: drawn here, with its title and width, the contribution draws what is inside. A
 * row's cards share out the room it has left, so that one rendering nothing (and gone with it) leaves no hole.
 */
const SlotCard: React.FC<{ options: DashboardCardOptions; children: React.ReactNode }> = ({ options, children }) => (
  <section className={`slot-frame card p-4 min-w-0 flex flex-col ${CARD_SIZE[options.size ?? 'normal'] ?? CARD_SIZE.normal}`}>
    {options.title && (
      <div className="flex items-center gap-2 mb-4">
        {options.icon && (
          <div className="w-8 h-8 rounded-lg gradient-primary-br flex items-center justify-center shadow-md">
            <Icon name={options.icon} size={16} className={GLYPH} />
          </div>
        )}
        <h4 className="text-sm font-semibold text-theme">{options.title}</h4>
      </div>
    )}
    <div className="slot-body flex-1 min-w-0">{children}</div>
  </section>
)

export const DashboardPage: React.FC = () => (
  <div className="flex flex-wrap gap-4">
    <Slot
      name="dashboard.cards"
      wrap={(element, contribution) => (
        <SlotCard options={contribution.options as DashboardCardOptions}>{element as React.ReactNode}</SlotCard>
      )}
    >
      <p className="card p-8 basis-full text-center text-sm text-theme-muted">没有可显示的卡片</p>
    </Slot>
  </div>
)

export const DashboardHeader: React.FC = () => (
  <Slot name="dashboard.header">
    <h2 className="text-3xl font-bold text-theme mb-2">Dashboard</h2>
    <p className="text-theme-secondary">欢迎使用 Lucky Lillia Bot</p>
  </Slot>
)
