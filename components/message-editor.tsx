'use client'

import { useState, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-react'
import type { Message } from '@/lib/messageIds'

export type { Message } from '@/lib/messageIds'

interface MessageEditorProps {
  messages: Message[]
  onChange: (messages: Message[]) => void
  availableColumns: string[]
  onInsertVariable?: (variable: string) => void
}

export function MessageEditor({
  messages,
  onChange,
  availableColumns,
  onInsertVariable,
}: MessageEditorProps) {
  const [showVariableMenu, setShowVariableMenu] = useState<string | null>(null)
  const [cursorPositions, setCursorPositions] = useState<Record<string, number>>({})
  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // Auto-grow textareas (by stable message id — avoids remount/focus loss)
  useEffect(() => {
    messages.forEach((m) => {
      const id = m.id
      if (!id) return
      const textarea = textareaRefs.current[id]
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = `${Math.max(100, textarea.scrollHeight)}px`
      }
    })
  }, [messages])

  // Close variable menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showVariableMenu !== null) {
        const menu = menuRefs.current[showVariableMenu]
        if (menu && !menu.contains(event.target as Node)) {
          setShowVariableMenu(null)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showVariableMenu])

  const handleMessageChange = (messageId: string, content: string) => {
    const updated = messages.map((m) =>
      m.id === messageId ? { ...m, content } : m
    )
    onChange(updated)
  }

  const handleRoleChange = (messageId: string, role: 'system' | 'user' | 'assistant') => {
    const updated = messages.map((m) => (m.id === messageId ? { ...m, role } : m))
    onChange(updated)
  }

  const handleDelete = (messageId: string) => {
    if (messages.length === 1) {
      // Don't allow deleting the last message
      return
    }
    const updated = messages.filter((m) => m.id !== messageId)
    onChange(updated)
  }

  const handleAddMessage = () => {
    const lastRole = messages[messages.length - 1]?.role || 'user'
    // Alternate between user and assistant, or add system if last was assistant
    const newRole: 'system' | 'user' | 'assistant' =
      lastRole === 'user' ? 'assistant' : 'user'

    onChange([
      ...messages,
      { id: crypto.randomUUID(), role: newRole, content: '' },
    ])
  }

  const insertVariable = (messageId: string, variable: string) => {
    const textarea = textareaRefs.current[messageId]
    if (!textarea) return

    const cursorPos = cursorPositions[messageId] || textarea.selectionStart
    const msg = messages.find((m) => m.id === messageId)
    if (!msg) return
    const text = msg.content
    const newText = text.slice(0, cursorPos) + `{{${variable}}}` + text.slice(cursorPos)
    
    handleMessageChange(messageId, newText)
    setShowVariableMenu(null)

    // Restore cursor position
    setTimeout(() => {
      textarea.focus()
      const newCursorPos = cursorPos + variable.length + 4 // {{variable}}
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const getRoleBadgeClass = (role: 'system' | 'user' | 'assistant') => {
    switch (role) {
      case 'system':
        return 'bg-muted text-muted-foreground border-border'
      case 'user':
        return 'bg-primary/10 text-primary border-primary/30'
      case 'assistant':
        return 'bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800'
    }
  }

  const getRoleLabel = (role: 'system' | 'user' | 'assistant') => {
    switch (role) {
      case 'system':
        return 'System'
      case 'user':
        return 'User'
      case 'assistant':
        return 'Assistant'
    }
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const mid = message.id
        if (!mid) {
          console.warn('MessageEditor: message missing id — parent should call ensureMessageIds')
          return null
        }
        return (
        <div key={mid} className="border border-border/60 rounded-xl p-4 space-y-3 bg-card">
          {/* Toolbar Header */}
          <div className="flex items-center justify-between mb-2">
            {/* Left side: Role Select */}
            <div className="flex items-center gap-2">
              <select
                value={message.role}
                onChange={(e) => handleRoleChange(mid, e.target.value as 'system' | 'user' | 'assistant')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border ${getRoleBadgeClass(message.role)} focus:outline-none focus:ring-2 focus:ring-offset-1 bg-transparent`}
              >
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
            </div>

            {/* Right side: Show Variables button and Delete button */}
            <div className="flex items-center gap-2">
              {availableColumns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowVariableMenu(showVariableMenu === mid ? null : mid)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                >
                  {showVariableMenu === mid ? 'Hide' : 'Show'} Variables
                </button>
              )}
              {messages.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(mid)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Body: Textarea */}
          <div className="relative">
            <Textarea
              ref={(el) => {
                textareaRefs.current[mid] = el
              }}
              value={message.content}
              onChange={(e) => {
                const textarea = e.target as HTMLTextAreaElement
                setCursorPositions((prev) => ({ ...prev, [mid]: textarea.selectionStart }))
                handleMessageChange(mid, e.target.value)
              }}
              onFocus={(e) => {
                const textarea = e.target as HTMLTextAreaElement
                setCursorPositions((prev) => ({ ...prev, [mid]: textarea.selectionStart }))
              }}
              placeholder={`Enter ${getRoleLabel(message.role).toLowerCase()} message. Use {{variableName}} to reference columns...`}
              className="min-h-[100px] font-mono text-sm resize-none w-full"
              style={{ height: 'auto' }}
            />

            {/* Variable Menu Dropdown */}
            {showVariableMenu === mid && availableColumns.length > 0 && (
              <div
                ref={(el) => {
                  menuRefs.current[mid] = el
                }}
                className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg p-1"
                style={{ top: '100%', right: 0 }}
              >
                <div className="text-xs font-semibold px-2.5 py-1.5 text-muted-foreground">Available Columns</div>
                {availableColumns.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => insertVariable(mid, col)}
                    className="w-full text-left px-2.5 py-2 text-sm hover:bg-accent rounded-lg flex items-center justify-between transition-colors"
                  >
                    <span>{col}</span>
                    <span className="text-xs text-muted-foreground font-mono">{`{{${col}}}`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        )
      })}

      {/* Footer - Add Message Button */}
      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddMessage}
          className="text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Message
        </Button>
      </div>
    </div>
  )
}
