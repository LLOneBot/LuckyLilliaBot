import React from 'react'
import { Loader2, Save } from 'lucide-react'

export const SaveButton: React.FC<{ saving: boolean; onClick: () => void; className?: string }> = ({ saving, onClick, className = '' }) => (
  <button onClick={onClick} disabled={saving} className={`btn-primary flex items-center gap-2 ${className}`}>
    {saving ? (
      <>
        <Loader2 size={20} className="animate-spin" />
        保存中...
      </>
    ) : (
      <>
        <Save size={20} />
        保存配置
      </>
    )}
  </button>
)
