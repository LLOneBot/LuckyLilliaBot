import React, { useEffect, useState } from 'react'
import { glassDebugSnapshot } from '../../utils/glassRuntime'

/*
 * Diagnostic overlay for the glass runtime, shown only when the page URL has
 * ?glassdebug=1. Exists so a report from a browser we cannot drive ("the ring
 * did not update") can come with the numbers: is the frame loop alive, which
 * luminance class each sheet carries, what tint the lens band was painted
 * with, which build is running.
 */
const GlassDebug: React.FC = () => {
  const [text, setText] = useState('')

  useEffect(() => {
    const tick = () => setText(JSON.stringify(glassDebugSnapshot(), null, 1))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [])

  return (
    <pre
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 99999,
        maxWidth: 420,
        maxHeight: '60vh',
        overflow: 'auto',
        margin: 0,
        padding: '8px 10px',
        font: '11px/1.35 ui-monospace, Consolas, monospace',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: 8,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </pre>
  )
}

export default GlassDebug
