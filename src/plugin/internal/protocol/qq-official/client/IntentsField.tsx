import React from 'react'
import { AlertTriangle } from 'lucide-react'
import type { FieldProps } from '@luckylillia/plugin-sdk/webui'
import type { QQOfficialIntent } from '../../../../../common/types'

const INTENT_GROUPS: { title: string; intents: { value: QQOfficialIntent; label: string; hint: string }[] }[] = [
  {
    title: '群聊和单聊',
    intents: [
      { value: 'GROUP_AND_C2C_EVENT', label: '群聊和单聊消息', hint: '群里 @ 机器人的消息、单聊消息、加好友、机器人进退群、群消息接收开关' },
      { value: 'GROUP_MEMBER_EVENT', label: '群成员和入群申请', hint: '群成员进出、入群申请；需要在开放平台开通' },
      { value: 'INTERACTION', label: '互动事件', hint: '用户点击消息按钮、单聊快捷菜单' },
      { value: 'MESSAGE_AUDIT', label: '消息审核', hint: '要审核的消息，等审核通过再拿到消息 ID' },
    ],
  },
  {
    title: '频道',
    intents: [
      { value: 'PUBLIC_GUILD_MESSAGES', label: '频道 @ 消息', hint: '频道里 @ 机器人的消息、这些消息被撤回' },
      { value: 'GUILD_MESSAGES', label: '频道全部消息', hint: '频道里的所有消息；仅私域机器人' },
      { value: 'DIRECT_MESSAGE', label: '频道私信', hint: '用户通过频道发给机器人的私信' },
      { value: 'GUILDS', label: '频道变动', hint: '频道和子频道的创建、变更、删除' },
      { value: 'GUILD_MEMBERS', label: '频道成员', hint: '频道成员加入、变更、离开' },
      { value: 'GUILD_MESSAGE_REACTIONS', label: '表情表态', hint: '频道消息上的表情表态' },
      { value: 'FORUMS_EVENT', label: '论坛（私域）', hint: '论坛的主题、帖子、评论；仅私域机器人' },
      { value: 'OPEN_FORUMS_EVENT', label: '论坛（公域）', hint: '公域机器人的论坛事件' },
      { value: 'AUDIO_ACTION', label: '音频', hint: '音频播放、上下麦' },
      { value: 'AUDIO_OR_LIVE_CHANNEL_MEMBER', label: '音视频 / 直播子频道', hint: '成员进出音视频、直播子频道' },
    ],
  },
]

const ALL_INTENTS = INTENT_GROUPS.flatMap(group => group.intents.map(intent => intent.value))

/** `.role('qq-official-intents')`: the intents grouped, with what each one brings. */
export const IntentsField: React.FC<FieldProps<QQOfficialIntent[] | undefined>> = ({ value, onChange }) => {
  const selected = value ?? []
  const toggle = (intent: QQOfficialIntent, on: boolean) => {
    const next = on ? [...selected, intent] : selected.filter(item => item !== intent)
    onChange(ALL_INTENTS.filter(item => next.includes(item)))
  }
  return (
    <div>
      <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 mb-3">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        订阅了机器人没有权限的事件，平台会直接断开连接，机器人停在离线；只勾开放平台上开通了的
      </p>
      <div className="space-y-4">
        {INTENT_GROUPS.map(group => (
          <div key={group.title}>
            <div className="text-xs text-theme-muted mb-2">{group.title}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {group.intents.map(intent => (
                <label key={intent.value} className="flex items-start gap-3 p-3 bg-theme-item rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(intent.value)}
                    onChange={e => toggle(intent.value, e.target.checked)}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 accent-pink-500"
                  />
                  <span>
                    <span className="block text-sm text-theme">{intent.label}</span>
                    <span className="block text-xs text-theme-muted">{intent.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
