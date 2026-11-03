import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T> {
  value: T
  label: string
}

export interface SelectProps<T> {
  value: T
  options: readonly SelectOption<T>[]
  onChange(value: T): void
  /** Shown while the value is none of the options */
  placeholder?: string
  disabled?: boolean
  className?: string
}

const GAP = 4
const ROW = 40
const MAX_HEIGHT = 264

/**
 * The WebUI's dropdown, in place of <select>, whose open list the browser draws in the system's style. The list is
 * portalled to the body at fixed coordinates so a dialog's scrolling body cannot clip it, and focus stays on the
 * button the way it does on a <select>.
 */
export function Select<T>({ value, options, onChange, placeholder = '请选择', disabled, className = '' }: SelectProps<T>) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState<React.CSSProperties>({})
  const [down, setDown] = useState(true)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.findIndex(option => option.value === value)
  const last = options.length - 1

  const show = (index: number) => {
    setActive(index)
    setOpen(true)
  }
  const pick = (index: number) => {
    setOpen(false)
    if (index >= 0 && index !== selected) onChange(options[index].value)
  }

  const measure = () => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) return setOpen(false)
    const below = window.innerHeight - rect.bottom - GAP * 2
    const above = rect.top - GAP * 2
    const fitsBelow = below >= Math.min(MAX_HEIGHT, options.length * ROW + 8) || below >= above
    setDown(fitsBelow)
    setPlace({
      left: rect.left,
      minWidth: rect.width,
      maxWidth: window.innerWidth - rect.left - GAP,
      maxHeight: Math.min(MAX_HEIGHT, fitsBelow ? below : above),
      fontSize: getComputedStyle(button).fontSize,
      ...(fitsBelow ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }),
    })
  }

  useLayoutEffect(() => {
    if (open) measure()
  }, [open])

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) =>
      !!buttonRef.current?.contains(target as Node) || !!listRef.current?.contains(target as Node)
    const onMouseDown = (e: MouseEvent) => !inside(e.target) && setOpen(false)
    // Follows the button rather than closing: a scroll still settling (a touchpad's glide, a dialog bringing the
    // button into view) would otherwise shut the list right as it opens
    const onScroll = (e: Event) => !listRef.current?.contains(e.target as Node) && measure()
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  useEffect(() => {
    const list = listRef.current
    const item = list?.children[active] as HTMLElement | undefined
    if (!list || !item) return
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
    }
  }, [open, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        if (!open) show(selected >= 0 ? selected : step > 0 ? 0 : last)
        else setActive(index => Math.min(last, Math.max(0, index + step)))
        break
      }
      case 'Home':
      case 'End':
        if (!open) return
        e.preventDefault()
        setActive(e.key === 'Home' ? 0 : last)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) pick(active)
        else show(Math.max(selected, 0))
        break
      case 'Escape':
        if (!open) return
        // Or the dialog it sits in closes too
        e.stopPropagation()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  const label = (text: string, key: React.Key, hidden = false) => (
    <span key={key} aria-hidden={hidden || undefined} className={`col-start-1 row-start-1 truncate ${hidden ? 'invisible h-0' : ''}`}>
      {text}
    </span>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show(Math.max(selected, 0)))}
        onKeyDown={onKeyDown}
        // A space's click comes on keyup, after onKeyDown has already acted on it
        onKeyUp={e => e.key === ' ' && e.preventDefault()}
        className={`input-field flex items-center gap-2 text-left ${className}`}
      >
        {/* Every label stacked in one cell, so the button is as wide as the longest, like a <select> */}
        <span className={`grid flex-1 min-w-0 ${selected < 0 ? 'text-theme-hint' : ''}`}>
          {options.map((option, index) => label(option.label, index, true))}
          {label(placeholder, 'placeholder', true)}
          {label(selected >= 0 ? options[selected].label : placeholder, 'shown')}
        </span>
        <ChevronDown size={16} className={`flex-shrink-0 text-theme-hint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          onMouseDown={e => e.preventDefault()}
          style={{ ...place, zIndex: 10100 }}
          className={`fixed overflow-y-auto py-1 glass glass-thick r-control glass-pop ${down ? 'origin-top' : 'origin-bottom'}`}
        >
          {options.map((option, index) => (
            <div
              key={index}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === selected}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(index)}
              className={`px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                index === active ? 'bg-pink-50 dark:bg-pink-900/30' : ''
              } ${index === selected ? 'text-pink-600' : 'text-theme'}`}
            >
              <span className="truncate">{option.label}</span>
              {index === selected && <Check size={16} className="flex-shrink-0 text-pink-500" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
