'use client'

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { Header, flexRender } from '@tanstack/react-table'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TableHead } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Sparkles,
  Pencil,
  Trash2,
  Link2,
  Mail,
  Building2,
  User,
  Calendar,
  Type,
} from 'lucide-react'
import { ColumnConfig } from '@/lib/types'

interface ColumnHeaderProps {
  header: Header<any, unknown>
  columnConfig?: ColumnConfig
  onRename: (newHeader: string) => void
  onDelete: () => void
  onColorChange: (columnId: string, color: string) => void
  onAIConfig?: () => void
  onDropContactConfig?: () => void
  onRenameClick?: () => void
  onResize?: (columnId: string, newWidth: number) => void
  onResizeEnd?: (columnId: string, newWidth: number) => void
  isIndexColumn: boolean
  /** Horizontal offset when a sticky column (e.g. row checkbox) sits to the left of the index column */
  stickyLeftOffset?: number
  leads?: any[]
}

// Helper function to get column icon based on header name
function getColumnIcon(headerName: string) {
  const lowerName = headerName.toLowerCase()

  if (lowerName.includes('url') || lowerName.includes('link') || lowerName.includes('web')) {
    return <Link2 className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
  }
  if (lowerName.includes('email')) {
    return <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
  }
  if (lowerName.includes('company') || lowerName.includes('business')) {
    return <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
  }
  if (lowerName.includes('name') || lowerName.includes('user') || lowerName.includes('person')) {
    return <User className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
  }
  if (lowerName.includes('date') || lowerName.includes('time')) {
    return <Calendar className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
  }
  if (lowerName.includes('ai') || lowerName.includes('enrich') || lowerName.includes('summary')) {
    return <Sparkles className="h-3.5 w-3.5 mr-2 text-purple-500" />
  }
  return <Type className="h-3.5 w-3.5 mr-2 text-muted-foreground/70" />
}

/**
 * Sortable column header component with drag-and-drop, sorting, and column options.
 */
function ColumnHeader({
  header,
  columnConfig,
  onRename,
  onDelete,
  onColorChange,
  onAIConfig,
  onDropContactConfig,
  onRenameClick,
  onResize,
  onResizeEnd,
  isIndexColumn,
  stickyLeftOffset = 0,
}: ColumnHeaderProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const canSort = header.column.getCanSort()
  const sortDirection = header.column.getIsSorted()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(
    columnConfig?.header || (header.column.columnDef.header as string)
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const columnWidth = header.getSize()
  const [isResizing, setIsResizing] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const resizeRef = useRef<{
    startX: number
    startWidth: number
    currentWidth: number
  } | null>(null)
  // Store active resize listener refs so we can remove them on unmount
  const resizeListenersRef = useRef<{
    move: ((e: MouseEvent) => void) | null
    up: (() => void) | null
  }>({ move: null, up: null })

  // Predefined color palette
  const colors = [
    { name: 'Default', value: undefined },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Green', value: '#10b981' },
    { name: 'Yellow', value: '#f59e0b' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Purple', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Gray', value: '#6b7280' },
    { name: 'Cyan', value: '#06b6d4' },
  ]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: header.id,
    disabled: isIndexColumn,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleBlur = () => {
    if (editValue.trim() && editValue !== columnConfig?.header) {
      onRename(editValue.trim())
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    } else if (e.key === 'Escape') {
      setEditValue(columnConfig?.header || '')
      setIsEditing(false)
    }
  }

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  // Use ResizeObserver to detect when column width changes
  useLayoutEffect(() => {
    if (!textRef.current || isIndexColumn) {
      setIsOverflowing(false)
      return
    }

    // Check if text is overflowing
    const checkOverflow = () => {
      if (textRef.current) {
        const isOverflow = textRef.current.scrollWidth > textRef.current.clientWidth
        setIsOverflowing(isOverflow)
      }
    }

    // Check overflow on mount and when column width changes
    checkOverflow()

    // Create ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })

    resizeObserver.observe(textRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [columnWidth, isIndexColumn, columnConfig?.header])

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    // Prevent triggering sort or drag-and-drop
    e.stopPropagation()
    e.preventDefault()

    if (!onResize || !columnConfig || isIndexColumn) return

    const startX = e.clientX
    const startWidth = columnWidth

    resizeRef.current = { startX, startWidth, currentWidth: startWidth }
    setIsResizing(true)

    // Add global event listeners
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) return

      const deltaX = moveEvent.clientX - resizeRef.current.startX
      const newWidth = Math.max(50, resizeRef.current.startWidth + deltaX) // Minimum width of 50px
      resizeRef.current.currentWidth = newWidth

      // Update the column width (lightweight sizing state only)
      if (onResize) {
        onResize(columnConfig.id, newWidth)
      }
    }

    const handleMouseUp = () => {
      // Fire onResizeEnd with the final width before clearing state
      if (resizeRef.current && onResizeEnd && columnConfig) {
        onResizeEnd(columnConfig.id, resizeRef.current.currentWidth)
      }
      setIsResizing(false)
      resizeRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      resizeListenersRef.current = { move: null, up: null }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    // Store refs so the unmount cleanup effect can remove them if needed
    resizeListenersRef.current = { move: handleMouseMove, up: handleMouseUp }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Safety-net: remove any dangling resize listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      const { move, up } = resizeListenersRef.current
      if (move) document.removeEventListener('mousemove', move)
      if (up) document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  // Validate hex color before using it in inline styles to prevent CSS injection
  const rawColor = columnConfig?.color
  const isValidHex = rawColor ? /^#[0-9A-Fa-f]{6}$/.test(rawColor) : false
  const safeColor = isValidHex ? rawColor : undefined

  return (
    <TableHead
      ref={setNodeRef}
      style={{
        ...style,
        width: columnWidth,
        minWidth: columnWidth,
        maxWidth: columnWidth,
        position: isIndexColumn ? 'sticky' : 'relative',
        left: isIndexColumn ? stickyLeftOffset : undefined,
        zIndex: isIndexColumn ? 51 : 50,
        padding: '0 12px',
        touchAction: 'none',
        backgroundColor: isIndexColumn
          ? undefined
          : safeColor
            ? `${safeColor}15` // 15% opacity - subtler
            : undefined,
        backgroundImage: isIndexColumn
          ? undefined
          : safeColor
            ? `linear-gradient(to bottom, ${safeColor}15, ${safeColor}08)`
            : undefined,
      }}
      className={`relative border-r border-border/60 border-b border-border/60 font-semibold text-sm text-foreground h-[38px] py-0 whitespace-nowrap overflow-hidden group ${
        isIndexColumn
          ? 'sticky bg-muted/40 text-center'
          : 'bg-muted/40'
      } ${isDragging ? 'opacity-50 bg-muted' : ''}`}
    >
      {/* DRAG ZONE - Only the content area is draggable, not the entire header */}
      <div
        className={`flex items-center gap-1 group h-full min-w-0 ${
          isIndexColumn ? 'justify-center w-full' : 'flex-1'
        } ${!isIndexColumn && columnConfig ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          paddingRight: !isIndexColumn && columnConfig && onResize ? '8px' : '0', // Make room for resize handle
        }}
        {...(!isIndexColumn && columnConfig
          ? {
              ...attributes,
              ...listeners,
            }
          : {})}
      >
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-7 text-xs px-2 rounded-md"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`${isIndexColumn ? '' : 'flex-1'} flex items-center ${
              isIndexColumn ? 'justify-center' : 'min-w-0'
            } ${canSort ? 'cursor-pointer select-none' : ''}`}
            onClick={(e) => {
              if (canSort && !isEditing) {
                e.stopPropagation()
                header.column.toggleSorting(undefined, true)
              }
            }}
            title={canSort ? 'Click to sort' : ''}
          >
            {header.isPlaceholder
              ? null
              : (
                <>
                  {!isIndexColumn && (
                    <span className="flex-shrink-0">
                      {getColumnIcon(
                        typeof header.column.columnDef.header === 'string'
                          ? header.column.columnDef.header
                          : columnConfig?.header || ''
                      )}
                    </span>
                  )}
                  <span
                    ref={textRef}
                    className={isIndexColumn ? '' : 'overflow-hidden whitespace-nowrap block'}
                    style={
                      !isIndexColumn && isOverflowing
                        ? {
                            maskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
                          }
                        : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </span>
                </>
              )}
          </span>
        )}
        {canSort && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              header.column.toggleSorting(undefined, true)
            }}
            className={`transition-opacity p-0.5 hover:bg-accent rounded-md ${
              sortDirection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={
              sortDirection === 'asc'
                ? 'Sort descending (Z to A)'
                : sortDirection === 'desc'
                  ? 'Clear sort'
                  : 'Sort ascending (A to Z)'
            }
            type="button"
          >
            {sortDirection === 'asc' ? (
              <ArrowUp className="h-3 w-3 text-primary" />
            ) : sortDirection === 'desc' ? (
              <ArrowDown className="h-3 w-3 text-primary" />
            ) : (
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        )}
        {/* AI Enrichment Settings Button */}
        {!isIndexColumn &&
          columnConfig &&
          columnConfig.type === 'ai_enrichment' &&
          onAIConfig && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAIConfig()
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-accent rounded-md"
              title="AI Column Settings"
              type="button"
            >
              <Sparkles className="h-3 w-3 text-purple-500" />
            </button>
          )}
        {/* DropContact Settings Button */}
        {!isIndexColumn &&
          columnConfig &&
          columnConfig.type === 'dropcontact' &&
          onDropContactConfig && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDropContactConfig()
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-accent rounded-md"
              title="DropContact Column Settings"
              type="button"
            >
              <Mail className="h-3 w-3 text-blue-500" />
            </button>
          )}
        {!isIndexColumn && columnConfig && (
          <DropdownMenu
            trigger={
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-accent rounded-md"
                title="Column options"
                type="button"
              >
                <MoreVertical className="h-3 w-3 text-muted-foreground" />
              </button>
            }
          >
            <div className="px-2.5 py-2">
              <div className="text-xs font-medium mb-2 text-muted-foreground">Column Color</div>
              <div className="grid grid-cols-4 gap-1.5">
                {colors.map((color) => (
                  <button
                    key={color.value || 'default'}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (columnConfig) {
                        onColorChange(columnConfig.id, color.value || '')
                      }
                    }}
                    className={`w-6 h-6 rounded-md border-2 transition-all ${
                      (!color.value && !columnConfig?.color) ||
                      color.value === columnConfig?.color
                        ? 'border-primary scale-110 shadow-sm'
                        : 'border-transparent hover:border-muted-foreground/50 hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: color.value || 'hsl(var(--muted))',
                    }}
                    title={color.name}
                    type="button"
                  />
                ))}
              </div>
            </div>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                if (onRenameClick) {
                  onRenameClick()
                }
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Rename Column
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete Column
            </DropdownMenuItem>
          </DropdownMenu>
        )}
      </div>
      {/* Resize Handle */}
      {!isIndexColumn && columnConfig && onResize && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute right-0 top-0 h-full w-4 cursor-col-resize z-50 group/resize"
          style={{
            touchAction: 'none',
            marginRight: '-8px', // Extend slightly beyond the column edge for easier grabbing
          }}
          title="Drag to resize column"
        >
          {/* Visual indicator line */}
          <div
            className={`absolute right-0 top-0 h-full w-0.5 transition-colors ${
              isResizing ? 'bg-primary' : 'bg-transparent group-hover/resize:bg-primary/50'
            }`}
          />
        </div>
      )}
    </TableHead>
  )
}

export default React.memo(ColumnHeader, (prev, next) => {
  return (
    prev.columnConfig === next.columnConfig &&
    prev.isIndexColumn === next.isIndexColumn &&
    prev.header === next.header
  )
})

export { ColumnHeader }
