import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from 'react'

export interface RichInputItem {
  type: 'text' | 'face' | 'image' | 'at'
  content?: string
  faceId?: number
  imageUrl?: string
  imageFile?: File
  atUid?: string
  atUin?: string
  atName?: string
}

export interface RichInputRef {
  focus: () => void
  clear: () => void
  insertFace: (faceId: number) => void
  insertText: (text: string) => void
  insertImage: (file: File | null, url: string) => void
  insertAt: (uid: string, uin: string, name: string) => void
  getContent: () => RichInputItem[]
  isEmpty: () => boolean
  cancelMention: () => void  // 取消 @ 提及模式
}

export interface MentionState {
  active: boolean
  query: string
  position: { top: number; left: number }
}

interface RichInputProps {
  placeholder?: string
  disabled?: boolean
  onEnter?: () => void
  onPaste?: (e: React.ClipboardEvent) => void
  onChange?: (items: RichInputItem[]) => void
  onMentionChange?: (state: MentionState) => void  // @ 状态变化回调
}

export const RichInput = forwardRef<RichInputRef, RichInputProps>(({ 
  placeholder = '输入消息...', 
  disabled = false, 
  onEnter,
  onPaste,
  onChange,
  onMentionChange
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const mentionStartRef = useRef<{ node: Node; offset: number } | null>(null)
  const [mentionActive, setMentionActive] = useState(false)

  // 解析编辑器内容
  const parseContent = useCallback((): RichInputItem[] => {
    const editor = editorRef.current
    if (!editor) return []
    
    const items: RichInputItem[] = []
    const nodes = editor.childNodes
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        // 移除零宽空格（Firefox 兼容用），保留其他所有字符包括普通空格
        const cleaned = text.replace(/\u200B/g, '')
        if (cleaned) items.push({ type: 'text', content: cleaned })
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        
        if (el.dataset.type === 'face') {
          items.push({ type: 'face', faceId: parseInt(el.dataset.faceId || '0') })
        } else if (el.dataset.type === 'image') {
          items.push({ type: 'image', imageUrl: el.dataset.imageUrl, imageFile: (el as any).__file })
        } else if (el.dataset.type === 'at') {
          items.push({ type: 'at', atUid: el.dataset.atUid, atUin: el.dataset.atUin, atName: el.dataset.atName })
        } else if (el.tagName === 'BR') {
          items.push({ type: 'text', content: '\n' })
        } else {
          const text = el.textContent || ''
          const cleaned = text.replace(/\u200B/g, '')
          if (cleaned) items.push({ type: 'text', content: cleaned })
        }
      }
    }
    return items
  }, [])

  const isEmpty = useCallback(() => {
    const items = parseContent()
    return items.length === 0 || (items.length === 1 && items[0].type === 'text' && !items[0].content?.trim())
  }, [parseContent])

  // 获取光标位置用于定位弹窗
  const getCaretPosition = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return { top: 0, left: 0 }
    
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const editorRect = editorRef.current?.getBoundingClientRect()
    
    if (!editorRect) return { top: 0, left: 0 }
    
    return {
      top: editorRect.bottom - rect.top + 8,
      left: rect.left - editorRect.left
    }
  }, [])

  // 获取 @ 后面的查询文字
  const getMentionQuery = useCallback(() => {
    if (!mentionStartRef.current) return ''
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return ''
    
    const range = selection.getRangeAt(0)
    const { node, offset } = mentionStartRef.current
    
    // 确保在同一个文本节点中
    if (range.startContainer !== node) return ''
    
    const text = node.textContent || ''
    return text.slice(offset, range.startOffset)
  }, [])

  // 取消 @ 提及模式
  const cancelMention = useCallback(() => {
    mentionStartRef.current = null
    setMentionActive(false)
    onMentionChange?.({ active: false, query: '', position: { top: 0, left: 0 } })
  }, [onMentionChange])

  // 检测 @ 输入
  const checkMention = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    
    if (node.nodeType !== Node.TEXT_NODE) {
      if (mentionActive) cancelMention()
      return
    }
    
    const text = node.textContent || ''
    const cursorPos = range.startOffset
    
    // 如果已经在 @ 模式中
    if (mentionActive && mentionStartRef.current) {
      // 检查光标是否还在 @ 之后
      if (mentionStartRef.current.node === node && cursorPos >= mentionStartRef.current.offset) {
        const query = getMentionQuery()
        // 如果查询中包含空格，取消 @ 模式
        if (query.includes(' ')) {
          cancelMention()
        } else {
          onMentionChange?.({ active: true, query, position: getCaretPosition() })
        }
      } else {
        cancelMention()
      }
      return
    }
    
    // 检测新的 @ 输入
    // 查找光标前最近的 @
    const textBeforeCursor = text.slice(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')
    
    if (lastAtIndex !== -1) {
      // @ 必须在行首或者前面是空格
      const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        const queryAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
        // 查询中不能有空格
        if (!queryAfterAt.includes(' ')) {
          mentionStartRef.current = { node, offset: lastAtIndex + 1 }
          setMentionActive(true)
          onMentionChange?.({ active: true, query: queryAfterAt, position: getCaretPosition() })
        }
      }
    }
  }, [mentionActive, getMentionQuery, getCaretPosition, cancelMention, onMentionChange])

  // 插入文本（用于 Unicode emoji 等）
  const insertText = useCallback((text: string) => {
    const editor = editorRef.current
    if (!editor) return
    
    cancelMention()
    
    const textNode = document.createTextNode(text)
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(textNode)
        range.setStartAfter(textNode)
        range.setEndAfter(textNode)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.appendChild(textNode)
      }
    } else {
      editor.appendChild(textNode)
    }
    
    editor.focus()
    onChange?.(parseContent())
  }, [onChange, parseContent, cancelMention])

  // 插入表情
  const insertFace = useCallback((faceId: number) => {
    const editor = editorRef.current
    if (!editor) return
    
    cancelMention()
    
    const span = document.createElement('span')
    span.contentEditable = 'false'
    span.dataset.type = 'face'
    span.dataset.faceId = String(faceId)
    span.className = 'inline-block align-middle mx-0.5 select-all'
    span.innerHTML = `<img src="/face/${faceId}.png" alt="[表情]" class="w-6 h-6 inline-block" draggable="false" />`
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(span)
        
        // Firefox 兼容：在不可编辑元素后插入零宽空格，确保光标有落脚点
        const zws = document.createTextNode('\u200B')
        span.after(zws)
        
        range.setStartAfter(zws)
        range.setEndAfter(zws)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.appendChild(span)
        const zws = document.createTextNode('\u200B')
        editor.appendChild(zws)
      }
    } else {
      editor.appendChild(span)
      const zws = document.createTextNode('\u200B')
      editor.appendChild(zws)
    }
    
    editor.focus()
    onChange?.(parseContent())
  }, [onChange, parseContent, cancelMention])

  // 插入图片
  const insertImage = useCallback((file: File | null, url: string) => {
    const editor = editorRef.current
    if (!editor) return
    
    cancelMention()
    
    const span = document.createElement('span')
    span.contentEditable = 'false'
    span.dataset.type = 'image'
    span.dataset.imageUrl = url
    if (file) {
      ;(span as any).__file = file
    }
    span.className = 'inline-block align-middle mx-0.5 select-all'
    span.innerHTML = `<img src="${url}" alt="[图片]" class="h-16 max-w-[200px] rounded inline-block object-cover" draggable="false" />`
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(span)
        
        // Firefox 兼容：在不可编辑元素后插入零宽空格，确保光标有落脚点
        const zws = document.createTextNode('\u200B')
        span.after(zws)
        
        range.setStartAfter(zws)
        range.setEndAfter(zws)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.appendChild(span)
        // Firefox 兼容：末尾也需要零宽空格
        const zws = document.createTextNode('\u200B')
        editor.appendChild(zws)
      }
    } else {
      editor.appendChild(span)
      const zws = document.createTextNode('\u200B')
      editor.appendChild(zws)
    }
    
    editor.focus()
    onChange?.(parseContent())
  }, [onChange, parseContent, cancelMention])

  // 插入 @ (从外部调用或选择成员后)
  const insertAt = useCallback((uid: string, uin: string, name: string) => {
    const editor = editorRef.current
    if (!editor) return
    
    // 如果是从 @ 选择器选择的，需要删除 @ 和查询文字
    if (mentionActive && mentionStartRef.current) {
      const { node, offset } = mentionStartRef.current
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        // 删除 @ 和后面的查询文字
        const deleteRange = document.createRange()
        deleteRange.setStart(node, offset - 1) // 包含 @
        deleteRange.setEnd(range.startContainer, range.startOffset)
        deleteRange.deleteContents()
      }
    }
    
    cancelMention()
    
    const span = document.createElement('span')
    span.contentEditable = 'false'
    span.dataset.type = 'at'
    span.dataset.atUid = uid
    span.dataset.atUin = uin
    span.dataset.atName = name
    span.className = 'inline-block align-middle mx-0.5 px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 text-sm rounded select-all'
    span.textContent = `@${name}`
    
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (editor.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        range.insertNode(span)
        range.setStartAfter(span)
        range.setEndAfter(span)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        editor.appendChild(span)
      }
    } else {
      editor.appendChild(span)
    }
    
    // 插入空格
    const space = document.createTextNode(' ')
    span.after(space)
    
    // 移动光标到空格后
    const newRange = document.createRange()
    newRange.setStartAfter(space)
    newRange.setEndAfter(space)
    selection?.removeAllRanges()
    selection?.addRange(newRange)
    
    editor.focus()
    onChange?.(parseContent())
  }, [mentionActive, onChange, parseContent, cancelMention])

  const clear = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      editor.innerHTML = ''
      cancelMention()
      onChange?.([])
    }
  }, [onChange, cancelMention])

  // 聚焦并将光标移到末尾
  const focus = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    // 将光标移到末尾
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false) // false = 折叠到末尾
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    focus,
    clear,
    insertFace,
    insertText,
    insertImage,
    insertAt,
    getContent: parseContent,
    isEmpty,
    cancelMention
  }), [focus, clear, insertFace, insertText, insertImage, insertAt, parseContent, isEmpty, cancelMention])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 如果在 @ 模式中，让 MentionPicker 处理方向键和回车
    if (mentionActive) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) {
        return // 不阻止，让事件冒泡到 MentionPicker
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelMention()
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current && !mentionActive) {
      e.preventDefault()
      onEnter?.()
    }
  }, [onEnter, mentionActive, cancelMention])

  const handleInput = useCallback(() => {
    checkMention()
    onChange?.(parseContent())
  }, [onChange, parseContent, checkMention])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          onPaste?.(e)
          return
        }
      }
    }
    
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      document.execCommand('insertText', false, text)
    }
  }, [onPaste])

  // 点击编辑器时检查 @ 状态
  const handleClick = useCallback(() => {
    setTimeout(checkMention, 0)
  }, [checkMention])

  // 失去焦点时延迟取消 @ 模式（给点击选择器留时间）
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (mentionActive) {
        cancelMention()
      }
    }, 200)
  }, [mentionActive, cancelMention])

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onPaste={handlePaste}
        onClick={handleClick}
        onBlur={handleBlur}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => { isComposingRef.current = false; handleInput() }}
        className={`min-h-[36px] max-h-[120px] overflow-y-auto px-3 py-2 outline-none text-theme whitespace-pre-wrap break-words ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ wordBreak: 'break-word' }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--theme-hint, #9ca3af);
          pointer-events: none;
        }
      `}</style>
    </div>
  )
})

RichInput.displayName = 'RichInput'
export default RichInput
