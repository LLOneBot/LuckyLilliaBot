import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { BotInfo } from '@luckylillia/plugin-sdk/webui'
import { useBots } from '../../stores/botsStore'

// Status of @satorijs/protocol
const ONLINE = 1
const CONNECT = 2
const RECONNECT = 4

/** Up to this many accounts are shown whole; more fold down to the first FOLDED until unfolded */
const UNFOLDED = 3
const FOLDED = 2

const STATUS: Record<number, { label: string; dot: string }> = {
  [ONLINE]: { label: '在线', dot: 'bg-emerald-500' },
  [CONNECT]: { label: '正在连接', dot: 'bg-amber-400' },
  [RECONNECT]: { label: '正在重连', dot: 'bg-amber-400' },
}
const statusOf = (bot: BotInfo) => STATUS[bot.status] ?? { label: '离线', dot: 'bg-neutral-400' }
const PROTOCOL_LABEL: Record<string, string> = { ntqq: 'NTQQ', qq: 'QQ 官方机器人', qqguild: 'QQ 频道' }
const protocolOf = (bot: BotInfo) => PROTOCOL_LABEL[bot.platform] ?? bot.platform
// Online first, then the ones on their way, then the rest; a stable sort keeps each group in the order given
const rank = (bot: BotInfo) => (bot.status === ONLINE ? 0 : bot.status === CONNECT || bot.status === RECONNECT ? 1 : 2)

const Avatar: React.FC<{ bot: BotInfo }> = ({ bot }) => {
  const [broken, setBroken] = useState(false)
  return (
    <div className='relative flex-shrink-0'>
      {bot.avatar && !broken ? (
        <img src={bot.avatar} alt='头像' className='w-9 h-9 rounded-full object-cover' onError={() => setBroken(true)} />
      ) : (
        <div className='w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-semibold'>
          {(bot.name || bot.selfId).charAt(0).toUpperCase()}
        </div>
      )}
      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-neutral-800 ${statusOf(bot).dot}`} />
    </div>
  )
}

/**
 * The foot of the sidebar: each account's avatar, nickname, number, protocol and connection status.
 */
const AccountsCard: React.FC = () => {
  const bots = useBots(state => state.bots) ?? []
  const [unfolded, setUnfolded] = useState(false)
  const sorted = [...bots].sort((a, b) => rank(a) - rank(b))
  const folds = sorted.length > UNFOLDED
  const shown = folds && !unfolded ? sorted.slice(0, FOLDED) : sorted

  return (
    <div className='p-3'>
      <div className='fill-quiet r-card p-2 max-h-[45vh] overflow-y-auto'>
        {shown.length ? shown.map(bot => (
          <div key={bot.sid} className='flex items-center gap-3 px-1 py-1' title={`${protocolOf(bot)} · ${statusOf(bot).label}`}>
            <Avatar bot={bot} />
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium text-theme truncate'>{bot.name || bot.selfId}</p>
              <p className='text-xs text-theme-muted truncate'>{bot.selfId}</p>
              <p className='mt-0.5 text-[11px] leading-4 text-theme-secondary truncate'>{protocolOf(bot)}</p>
            </div>
          </div>
        )) : (
          <div className='flex items-center gap-3 px-1 py-1'>
            <img
              src='/logo-64.webp'
              srcSet='/logo-64.webp 64w, /logo-128.webp 128w'
              sizes='36px'
              alt=''
              className='w-9 h-9 rounded-full object-cover flex-shrink-0'
            />
            <p className='flex-1 min-w-0 text-sm text-theme-muted truncate'>还没有登录的账号</p>
          </div>
        )}
        {folds && (
          <button
            onClick={() => setUnfolded(!unfolded)}
            className='w-full mt-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-theme-muted hover:text-theme hover:bg-theme-item-hover transition-colors'
          >
            {unfolded ? <><ChevronUp size={14} />收起</> : <><ChevronDown size={14} />还有 {sorted.length - FOLDED} 个账号</>}
          </button>
        )}
      </div>
    </div>
  )
}

export default AccountsCard
