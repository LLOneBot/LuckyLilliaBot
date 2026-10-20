import React from 'react'
import { PowerOff } from 'lucide-react'

/** Stands in for a page whose builtin plugin is disabled. */
const BuiltinDisabledPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="card p-10 text-center">
    <PowerOff size={40} className="mx-auto text-theme-hint mb-4" />
    <p className="text-theme font-medium">「{title}」已在插件页停用</p>
    <p className="text-sm text-theme-secondary mt-2">启用后这个页面才能使用</p>
    <button type="button" onClick={() => { window.location.hash = 'plugins' }} className="btn-glass mt-6">
      前往插件页
    </button>
  </div>
)

export default BuiltinDisabledPage
