'use client'

import { useState, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { X, Plus } from 'lucide-react'

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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
  const [showVariableMenu, setShowVariableMenu] = useState<number | null>(null)
  const [cursorPositions, setCursorPositions] = useState<Record<number, number>>({})
  const menuRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})

  // Auto-grow textareas
  useEffect(() => {
    messages.forEach((_, index) => {
      const textarea = textareaRefs.current[index]
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

  const handleMessageChange = (index: number, content: string) => {
    const updated = [...messages]
    updated[index] = { ...updated[index], content }
    onChange(updated)
  }

  const handleRoleChange = (index: number, role: 'system' | 'user' | 'assistant') => {
    const updated = [...messages]
    updated[index] = { ...updated[index], role }
    onChange(updated)
  }

  const handleDelete = (index: number) => {
    if (messages.length === 1) {
      // Don't allow deleting the last message
      return
    }
    const updated = messages.filter((_, i) => i !== index)
    onChange(updated)
  }

  const handleAddMessage = () => {
    const lastRole = messages[messages.length - 1]?.role || 'user'
    // Alternate between user and assistant, or add system if last was assistant
    const newRole: 'system' | 'user' | 'assistant' = 
      lastRole === 'user' ? 'assistant' : 'user'
    
    onChange([...messages, { role: newRole, content: '' }])
  }

  const insertVariable = (index: number, variable: string) => {
    const textarea = textareaRefs.current[index]
    if (!textarea) return

    const cursorPos = cursorPositions[index] || textarea.selectionStart
    const text = messages[index].content
    const newText = text.slice(0, cursorPos) + `{{${variable}}}` + text.slice(cursorPos)
    
    handleMessageChange(index, newText)
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
      {messages.map((message, index) => (
        <div key={index} className="border border-border/60 rounded-xl p-4 space-y-3 bg-card">
          {/* Toolbar Header */}
          <div className="flex items-center justify-between mb-2">
            {/* Left side: Role Select */}
            <div className="flex items-center gap-2">
              <select
                value={message.role}
                onChange={(e) => handleRoleChange(index, e.target.value as 'system' | 'user' | 'assistant')}
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
                  onClick={() => setShowVariableMenu(showVariableMenu === index ? null : index)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                >
                  {showVariableMenu === index ? 'Hide' : 'Show'} Variables
                </button>
              )}
              {messages.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(index)}
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
                textareaRefs.current[index] = el
              }}
              value={message.content}
              onChange={(e) => {
                const textarea = e.target as HTMLTextAreaElement
                setCursorPositions({ ...cursorPositions, [index]: textarea.selectionStart })
                handleMessageChange(index, e.target.value)
              }}
              onFocus={(e) => {
                const textarea = e.target as HTMLTextAreaElement
                setCursorPositions({ ...cursorPositions, [index]: textarea.selectionStart })
              }}
              placeholder={`Enter ${getRoleLabel(message.role).toLowerCase()} message. Use {{variableName}} to reference columns...`}
              className="min-h-[100px] font-mono text-sm resize-none w-full"
              style={{ height: 'auto' }}
            />
            
            {/* Variable Menu Dropdown */}
            {showVariableMenu === index && availableColumns.length > 0 && (
              <div
                ref={(el) => {
                  menuRefs.current[index] = el
                }}
                className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg p-1"
                style={{ top: '100%', right: 0 }}
              >
                <div className="text-xs font-semibold px-2.5 py-1.5 text-muted-foreground">Available Columns</div>
                {availableColumns.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => insertVariable(index, col)}
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
      ))}

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
