import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/** Renders into a node of its own under body, so that dialogs escape the page's stacking. */
const Portal = ({ children }: { children: ReactNode }) => {
  const el = useRef<HTMLDivElement | null>(null)
  if (!el.current) el.current = document.createElement('div')
  useEffect(() => {
    const node = el.current!
    document.body.appendChild(node)
    return () => {
      document.body.removeChild(node)
    }
  }, [])
  return createPortal(children, el.current)
}

export default Portal
