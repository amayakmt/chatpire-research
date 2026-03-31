'use client'

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  ColumnResizeMode,
  Row,
  SortingState,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CSVImporter } from '@/components/csv-importer'
import { AIConfigurationModal } from '@/components/ai-configuration-modal'
import { DropContactMappingModal } from '@/components/dropcontact-mapping-modal'
import { CellDetailPanel } from '@/components/cell-detail-panel'
import { DataRow, ROW_SELECT_COL_WIDTH } from '@/components/board/DataRow'
import { BoardHeader } from '@/components/board/BoardHeader'
import { ColumnHeader } from '@/components/board/ColumnHeader'
import { useBoardData } from '@/hooks/useBoardData'
import { useColumnManager } from '@/hooks/useColumnManager'
import { Toast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Lead, Board, ColumnConfig } from '@/lib/types'
import { isDemoMode, DEMO_MAX_ROWS, DEMO_MODEL_ID } from '@/lib/demoMode'
import { convertBoardToCSV } from '@/lib/csvHelpers'
import { Upload, ArrowLeft, MoreVertical, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Palette, Sparkles, Plus, Type, Link2, Mail, Building2, User, Calendar, RefreshCw, Download, Pencil, X } from 'lucide-react'
import { Loader } from '@/components/ui/loader'
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface BoardPageProps {
  params: {
    id: string
  }
}

// Helper function to format column header from key
function formatColumnHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim()
}

// Helper function to detect if a value is a URL
function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Fetches up to `maxRows` leads in DB order (matches /api/leads), chunked for the API 5000 cap. */
async function fetchLeadsForEnrichmentRun(
  boardId: string,
  maxRows: number,
  getHeaders: () => Record<string, string>
): Promise<Lead[]> {
  const API_MAX = 5000
  const out: Lead[] = []
  let start = 0
  while (start < maxRows) {
    const chunk = Math.min(API_MAX, maxRows - start)
    const response = await fetch(
      `/api/leads?board_id=${encodeURIComponent(boardId)}&start=${start}&limit=${chunk}`,
      { headers: getHeaders() }
    )
    if (!response.ok) {
      throw new Error('Failed to fetch leads for enrichment')
    }
    const data = await response.json()
    const batch: Lead[] = data.leads || []
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < chunk) break
    start += batch.length
  }
  return out
}

/** All lead IDs for the board in DB display order (GET /api/leads/ids). */
async function fetchAllLeadIdsForBoard(
  boardId: string,
  getHeaders: () => Record<string, string>
): Promise<string[]> {
  const response = await fetch(
    `/api/leads/ids?board_id=${encodeURIComponent(boardId)}`,
    { headers: getHeaders() }
  )
  if (!response.ok) {
    throw new Error('Failed to fetch lead IDs for this board')
  }
  const data = await response.json()
  const ids = data.ids
  if (!Array.isArray(ids)) return []
  return ids.filter((id: unknown) => typeof id === 'string' && id.length > 0)
}


// Generate initial column config from data
function generateInitialColumnConfig(leads: Lead[]): ColumnConfig[] {
  if (leads.length === 0) return []

  const sampleSize = Math.min(50, leads.length)
  const sampleRows = leads.slice(0, sampleSize)
  const allKeys = new Set<string>()

  sampleRows.forEach((lead) => {
    if (lead.data && typeof lead.data === 'object') {
      Object.keys(lead.data).forEach((key) => allKeys.add(key))
    }
  })

  const sortedKeys = Array.from(allKeys).sort()

  return sortedKeys.map((key, index) => {
    const sampleValues = sampleRows
      .map((lead) => {
        const value = lead.data?.[key]
        return value ? String(value) : ''
      })
      .filter((v) => v.length > 0)

    const maxLength = Math.max(
      key.length,
      ...sampleValues.map((v) => v.length)
    )

    const estimatedWidth = Math.min(Math.max(maxLength * 8 + 40, 120), 400)

            return {
              id: key,
              header: key, // Use exact key, no formatting
              width: estimatedWidth,
              order: index,
              visible: true, // Keep for backward compatibility, but not used
            }
  })
}


// Editable cell component
function EditableCell({
  initialValue,
  leadId,
  // columnId here is the UUID from board_columns.id (new system) or the plain
  // column key string (legacy system). It is used as the JSON path key when
  // PATCHing a lead, so both systems work: the API accepts either form.
  columnId, // UUID from board_columns.id (new system) or column key (legacy)
  onSave,
  onCancel,
}: {
  initialValue: string
  leadId: string
  columnId: string // UUID from board_columns.id (new system) or column key (legacy)
  onSave: (value: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus input when component mounts
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleBlur = () => {
    if (value !== initialValue) {
      onSave(value)
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value !== initialValue) {
        onSave(value)
      } else {
        onCancel()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setValue(initialValue)
      onCancel()
    }
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="font-mono text-sm h-9 px-2 border-primary focus:ring-2 focus:ring-primary rounded-lg"
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function SelectAllVisibleHeader({
  getVisibleLeadIds,
  selectedLeadIds,
  setSelectedLeadIds,
  viewportVersion,
}: {
  getVisibleLeadIds: () => string[]
  selectedLeadIds: Set<string>
  setSelectedLeadIds: React.Dispatch<React.SetStateAction<Set<string>>>
  viewportVersion: number
}) {
  const visibleIds = useMemo(
    () => getVisibleLeadIds(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewportVersion bumps on scroll to refresh visibility
    [getVisibleLeadIds, viewportVersion]
  )
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.has(id))
  const someSelected = visibleIds.some((id) => selectedLeadIds.has(id))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = someSelected && !allSelected
    }
  }, [someSelected, allSelected])

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={allSelected}
      onChange={() => {
        setSelectedLeadIds((prev) => {
          const next = new Set(prev)
          if (allSelected) {
            visibleIds.forEach((id) => next.delete(id))
          } else {
            visibleIds.forEach((id) => next.add(id))
          }
          return next
        })
      }}
      className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer"
      title="Select all rows currently visible in the viewport"
      aria-label="Select all visible rows"
    />
  )
}


export default function BoardPage({ params }: BoardPageProps) {
  const router = useRouter()
  
  // Use hooks for data management
  const {
    leads,
    setLeads,
    board,
    isLoading,
    error: boardError,
    totalRows,
    setTotalRows,
    refetchLeads,
    refetchBoard,
  } = useBoardData({ boardId: params.id })
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [columnResizeMode, setColumnResizeMode] = useState<ColumnResizeMode>('onChange')
  
  // Use column manager hook
  const {
    columnConfigs,
    setColumnConfigs,
    deletedColumnIds,
    isSavingColumns,
    hasInitialized,
    setHasInitialized,
    saveColumnConfig,
    saveColumnConfigDebounced,
    persistColumnOrder,
    handleColumnRename,
    handleDeleteColumn,
    handleColumnColorChange,
    handleCreateAIColumn,
    handleSaveAIConfig,
    handleAddTextColumn,
    handleCreateDropContactColumn,
    handleSaveDropContactMapping,
  } = useColumnManager({
    board,
    boardId: params.id,
    onBoardUpdate: refetchBoard,
    onLeadsUpdate: refetchLeads,
    onToast: (message, variant) => setToast({ message, variant }),
  })
  // Load sorting state from localStorage on mount
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`sorting_${params.id}`)
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('Error parsing saved sorting state:', e)
          return []
        }
      }
    }
    return []
  })

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`sorting_${params.id}`, JSON.stringify(sorting))
    }
  }, [params.id, sorting])
  // editingCell.columnId is the UUID from board_columns.id (new system) or plain
  // column key (legacy). Matches the key used to store the value in lead.data.
  const [editingCell, setEditingCell] = useState<{ leadId: string; columnId: string /* UUID (new) or key (legacy) */ } | null>(null)
  const [toast, setToast] = useState<{ message: string; variant?: 'default' | 'destructive' } | null>(null)
  const [isAIConfigModalOpen, setIsAIConfigModalOpen] = useState(false)
  const [selectedAIColumn, setSelectedAIColumn] = useState<ColumnConfig | null>(null)
  const [isDropContactMappingModalOpen, setIsDropContactMappingModalOpen] = useState(false)
  const [selectedDropContactColumn, setSelectedDropContactColumn] = useState<ColumnConfig | null>(null)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  // columnToRename.id and .columnId are both the UUID from board_columns.id (new system).
  // .name is the human-readable display name shown in the rename dialog.
  const [columnToRename, setColumnToRename] = useState<{ id: string /* UUID */; name: string /* display name */; columnId: string /* UUID */ } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isAddingColumn, setIsAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const newColumnNameInputRef = useRef<HTMLInputElement>(null)
  const [processingLeads, setProcessingLeads] = useState<Set<string>>(new Set())
  const [processingColumnId, setProcessingColumnId] = useState<string | null>(null)
  const [processingProgress, setProcessingProgress] = useState<{ current: number; total: number } | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const processingColumnIdRef = useRef<string | null>(null)
  const processingLeadsRef = useRef<Set<string>>(new Set())
  const processingColumnNameRef = useRef<string | null>(null)
  const isRunningRef = useRef<boolean>(false)

  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set())
  const [deleteRowsDialogOpen, setDeleteRowsDialogOpen] = useState(false)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number; leadId: string } | null>(
    null
  )
  const [viewportVersion, setViewportVersion] = useState(0)
  const scrollBumpRaf = useRef<number | null>(null)

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
    }
  }

  const pendingDeleteIdsRef = useRef<string[]>([])

  const toggleLeadSelection = useCallback((id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, lead: Lead) => {
    e.preventDefault()
    setRowContextMenu({ x: e.clientX, y: e.clientY, leadId: lead.id })
  }, [])

  const openDeleteRowsDialog = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    pendingDeleteIdsRef.current = ids
    setPendingDeleteIds(ids)
    setDeleteRowsDialogOpen(true)
  }, [])

  const confirmBulkDelete = useCallback(async () => {
    const ids = pendingDeleteIdsRef.current
    if (ids.length === 0) {
      setDeleteRowsDialogOpen(false)
      return
    }
    const snapshotLeads = leads.slice()
    const snapshotTotal = totalRows
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)))
    setTotalRows((t) => Math.max(0, t - ids.length))
    try {
      const res = await fetch('/api/leads/bulk-delete', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ boardId: params.id, ids }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(j.message || 'Failed to delete rows')
      }
      setSelectedLeadIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setProcessingLeads((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      processingLeadsRef.current = new Set(
        [...processingLeadsRef.current].filter((id) => !ids.includes(id))
      )
      setDeleteRowsDialogOpen(false)
      setPendingDeleteIds([])
      pendingDeleteIdsRef.current = []
      setRowContextMenu(null)
    } catch (err) {
      setLeads(snapshotLeads)
      setTotalRows(snapshotTotal)
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete rows',
        variant: 'destructive',
      })
      setDeleteRowsDialogOpen(false)
    }
  }, [leads, totalRows, params.id, setLeads, setTotalRows])

  const handleTableScrollBump = useCallback(() => {
    if (scrollBumpRaf.current != null) cancelAnimationFrame(scrollBumpRaf.current)
    scrollBumpRaf.current = requestAnimationFrame(() => {
      setViewportVersion((v) => v + 1)
      scrollBumpRaf.current = null
    })
  }, [])

  // TODO: Consolidate 15+ useState calls into useReducer for better state cohesion.
  // Current state vars:
  //   isImportModalOpen, columnResizeMode, sorting, editingCell, toast,
  //   isAIConfigModalOpen, selectedAIColumn, isDropContactMappingModalOpen,
  //   selectedDropContactColumn, isRenameDialogOpen, columnToRename, renameValue,
  //   isAddingColumn, newColumnName, processingLeads, processingColumnId,
  //   processingProgress, selectedCell, columnSizing, parentRef

  // selectedCell.columnId is the UUID from board_columns.id (same as config.id).
  // selectedCell.columnName is the human-readable display name (config.header).
  // These are kept separate to avoid UUID-vs-name confusion (columnId vs columnUuid are both UUIDs).
  const [selectedCell, setSelectedCell] = useState<{
    lead: Lead
    columnId: string   // UUID from board_columns.id — used for data keying (lead.data[columnId])
    columnName: string // display name / column header — shown in the UI only
    value: any
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Drag only starts after moving mouse 8px. Clicks pass through to Sort.
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Initialize column configs from board data
  useEffect(() => {
    if (!board || hasInitialized) return
    
    // Load columns from board_columns table (new format)
    if (Array.isArray(board.columns) && board.columns.length > 0) {
      // Columns from board_columns table - use UUIDs as IDs
      // CRITICAL: Sort by order to ensure UI reflects database reality
      const sortedConfigs = board.columns
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .map((col: any) => ({
          id: col.id, // CRITICAL: Use UUID as id (not name) for UUID-based data access
          header: col.name, // Use column name as display header
          width: col.config?.width || 200,
          order: col.order ?? 0, // Ensure order is always a number
          type: col.type || 'text',
          visible: true,
          color: col.config?.color,
          columnId: col.id, // Store the UUID for API calls (same as id now)
          config: col.config || {}, // Store the full config object (includes prompt, model, etc.)
        }))
      setColumnConfigs(sortedConfigs)
      setHasInitialized(true)
    } else if (board.columns) {
      // Legacy format - check if it's the old format (with metadata) or old format (just array)
      if (typeof board.columns === 'object' && 'configs' in board.columns && Array.isArray((board.columns as any).configs)) {
        // Old format with metadata - convert to use exact names
        const sortedConfigs = [...((board.columns as any).configs as ColumnConfig[])]
          .sort((a, b) => a.order - b.order)
          .map((config) => ({
            ...config,
            header: config.id, // Use ID as header (exact name)
          }))
        setColumnConfigs(sortedConfigs)
        setHasInitialized(true)
      } else if (Array.isArray(board.columns) && board.columns.length > 0) {
        // Old format (just array) - convert to use exact names
        const sortedConfigs = [...board.columns]
          .sort((a, b) => a.order - b.order)
          .map((config) => ({
            ...config,
            header: config.id, // Use ID as header (exact name)
          }))
        setColumnConfigs(sortedConfigs)
        setHasInitialized(true)
      }
    }
  }, [board, hasInitialized, setColumnConfigs, setHasInitialized])

  // Cleanup polling on unmount
  // Cleanup: clear the enrichment/DropContact polling interval on unmount.
  // refreshIntervalRef.current is set inside handleRunAIColumn (finally block)
  // and handleRunDropContactColumn. Both functions also clear it on normal
  // completion, so this is a safety net for navigation-away scenarios.
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      // Allow a future mount to start enrichment fresh
      isRunningRef.current = false
    }
  }, [])


  // Generate initial column config if none exists (only if no saved configs)
  useEffect(() => {
    // Skip if columns are already loaded (from fetchBoard) - prevents duplicates
    if (columnConfigs.length > 0) {
      if (!hasInitialized) {
        setHasInitialized(true)
      }
      return
    }
    
    // Only run if we have both board and leads loaded, haven't initialized
    if (leads.length > 0 && board && !hasInitialized) {
      // Check if columns are from board_columns table (new system)
      const isNewSystem = Array.isArray(board.columns) && 
                         board.columns.length > 0 && 
                         board.columns[0]?.hasOwnProperty('name') && 
                         board.columns[0]?.hasOwnProperty('type')
      
      if (isNewSystem) {
        // New system: columns from board_columns table
        // These should already be loaded in fetchBoard, but ensure they're set
        const sortedConfigs = (board.columns as any[])
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((col: any) => ({
            id: col.name,
            header: col.name,
            width: col.config?.width || 200,
            order: col.order || 0,
            type: col.type || 'text',
            visible: true,
            color: col.config?.color,
          }))
        setColumnConfigs(sortedConfigs)
        setHasInitialized(true)
        return // Don't run old system logic
      }
      
      // Old system: Check if board has saved columns
      let hasSavedColumns = false
      if (board.columns) {
        if (typeof board.columns === 'object' && 'configs' in board.columns) {
          // Old format with metadata
          hasSavedColumns = Array.isArray(board.columns.configs) && board.columns.configs.length > 0
        } else if (Array.isArray(board.columns)) {
          // Old format (just array) - but check if it's actually new system
          // New system columns have 'name' and 'type', old system has 'id' and 'header'
          const isActuallyNewSystem = board.columns.length > 0 && 
                                     board.columns[0]?.hasOwnProperty('name') && 
                                     board.columns[0]?.hasOwnProperty('type')
          if (!isActuallyNewSystem) {
            hasSavedColumns = board.columns.length > 0
          }
        }
      }
      
      if (!hasSavedColumns && columnConfigs.length === 0) {
        // No saved columns and no configs in state - generate initial config (old system only)
        const initialConfig = generateInitialColumnConfig(leads)
        if (initialConfig.length > 0) {
          setColumnConfigs(initialConfig)
          setHasInitialized(true)
          saveColumnConfig(initialConfig)
        }
      } else if (hasSavedColumns && columnConfigs.length === 0) {
        // Board has saved columns but state hasn't been set yet - set them
        // Check if it's new format (with metadata) or old format
        if (board.columns && typeof board.columns === 'object' && 'configs' in board.columns) {
          // New format
          const metadata = board.columns as any
          // Sort by order to ensure correct display order
          const sortedConfigs = [...(metadata.configs || [])].sort((a: ColumnConfig, b: ColumnConfig) => a.order - b.order)
          setColumnConfigs(sortedConfigs)
          if (metadata.deletedIds && Array.isArray(metadata.deletedIds)) {
            // deletedColumnIds is managed by useColumnManager hook
          }
        } else if (Array.isArray(board.columns)) {
          // Old format - migrate it
          // Sort by order to ensure correct display order
          const sortedConfigs = [...board.columns].sort((a: ColumnConfig, b: ColumnConfig) => a.order - b.order)
          setColumnConfigs(sortedConfigs)
          
          // Identify deleted columns: keys in data that aren't in saved configs
          const allKeys = new Set<string>()
          leads.forEach((lead) => {
            if (lead.data && typeof lead.data === 'object') {
              Object.keys(lead.data).forEach((key) => allKeys.add(key))
            }
          })
          const savedColumnIds = new Set(board.columns.map((c: ColumnConfig) => c.id))
          const deletedKeys = Array.from(allKeys).filter((key) => !savedColumnIds.has(key))
          if (deletedKeys.length > 0) {
            // deletedColumnIds is managed by useColumnManager hook
            // Migrate to new format immediately
            const columnsMetadata = {
              configs: board.columns,
              deletedIds: deletedKeys,
            }
            saveColumnConfig(board.columns) // This will save in new format
          }
        }
        
        setHasInitialized(true)
      }
    }
  }, [leads, board, hasInitialized, columnConfigs.length, saveColumnConfig])

  // Sync columns from board.columns (for NEW system - board_columns table)
  // This ensures new columns created in the database appear in the frontend
  useEffect(() => {
    if (!board || !hasInitialized || !Array.isArray(board.columns)) {
      return
    }

    // Check if using new board_columns system
    const isNewSystem = board.columns.length > 0 && 
                       board.columns[0]?.hasOwnProperty('name') && 
                       board.columns[0]?.hasOwnProperty('type')
    
    if (!isNewSystem) {
      return // Old system handled separately below
    }

    // NEW SYSTEM: Sync columnConfigs from board.columns (API is source of truth)
    // Iterate over API columns (source of truth) and merge with existing state
    const mergedConfigs = board.columns.map((apiCol: any) => {
      // Find existing config in state
      const existingConfig = columnConfigs.find(
        (c) => c.id === apiCol.name || c.id === apiCol.id
      )

      if (existingConfig) {
        // Merge existing config with API data
        // Apply safeguard: Keep existing config.config if API config is empty
        const apiConfig = apiCol.config || {}
        const existingConfigConfig = existingConfig.config || {}
        
        // If API config is empty but we have existing config, keep existing
        // Otherwise, use API config (it's the source of truth)
        const mergedConfig = Object.keys(apiConfig).length === 0 && Object.keys(existingConfigConfig).length > 0
          ? existingConfigConfig
          : apiConfig

        return {
          ...existingConfig,
          id: apiCol.id, // CRITICAL: Use UUID as id (not name) for UUID-based data access
          header: apiCol.name,
          width: apiCol.config?.width || existingConfig.width || 200,
          order: apiCol.order ?? existingConfig.order ?? 0,
          type: apiCol.type || existingConfig.type || 'text',
          color: apiCol.config?.color || existingConfig.color,
          config: mergedConfig, // Merged config with safeguard
        }
      } else {
        // NEW COLUMN: Add it even if config is empty
        console.log('➕ Adding new column from API:', apiCol.name)
        return {
          id: apiCol.id, // CRITICAL: Use UUID as id (not name) for UUID-based data access
          header: apiCol.name,
          width: apiCol.config?.width || 200,
          order: apiCol.order ?? 0,
          type: apiCol.type || 'text',
          visible: true,
          color: apiCol.config?.color,
          config: apiCol.config || {}, // Empty config is fine for new columns
        }
      }
    })

    // CRITICAL: Sort by order to ensure UI reflects database reality
    const sortedConfigs = mergedConfigs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    // Only update if something changed
    const currentIds = new Set(columnConfigs.map(c => c.id))
    const newIds = new Set(sortedConfigs.map(c => c.id))
    const idsChanged = currentIds.size !== newIds.size || 
                       !Array.from(newIds).every(id => currentIds.has(id))
    
    // Check if order changed (compare sorted positions)
    const orderChanged = sortedConfigs.some((newConfig, index) => {
      const oldConfig = columnConfigs.find(c => c.id === newConfig.id)
      if (!oldConfig) return true // New column
      const oldIndex = columnConfigs.findIndex(c => c.id === newConfig.id)
      return oldIndex !== index || oldConfig.order !== newConfig.order
    })
    
    // Check if width, color, or config changed
    const configsChanged = idsChanged || sortedConfigs.some((newConfig) => {
      const oldConfig = columnConfigs.find(c => c.id === newConfig.id)
      if (!oldConfig) {
        return true // New column
      }
      // Check if width, color, or config changed
      if (oldConfig.width !== newConfig.width) return true
      if (oldConfig.color !== newConfig.color) return true
      const oldConfigConfig = oldConfig.config || {}
      const newConfigConfig = newConfig.config || {}
      return JSON.stringify(oldConfigConfig) !== JSON.stringify(newConfigConfig)
    })

    if (configsChanged || orderChanged) {
      const addedColumns = sortedConfigs
        .filter(newCol => !columnConfigs.some(oldCol => oldCol.id === newCol.id))
        .map(c => c.id)
      
      setColumnConfigs(sortedConfigs)
    }
  }, [board?.columns, hasInitialized]) // Use board.columns directly, not columnConfigs to avoid loops

  // Sync new columns when data changes (only after initialization)
  // IMPORTANT: Only run this for the OLD system (boards.columns JSONB)
  // For the NEW system (board_columns table), columns are managed via API
  useEffect(() => {
    if (leads.length > 0 && board && hasInitialized && columnConfigs.length > 0) {
      // Check if using new board_columns system
      // New system: board.columns is an array of objects with 'name' and 'type' properties
      const isNewSystem = Array.isArray(board.columns) && 
                         board.columns.length > 0 && 
                         board.columns[0]?.hasOwnProperty('name') && 
                         board.columns[0]?.hasOwnProperty('type')
      
      if (isNewSystem) {
        // New system - columns are managed in board_columns table
        // Don't auto-generate columns from leads data to avoid duplicates
        // Only create columns via API when explicitly needed
        return
      }

      // Old system only: Get all unique keys from leads data
      const allKeys = new Set<string>()
      leads.forEach((lead) => {
        if (lead.data && typeof lead.data === 'object') {
          Object.keys(lead.data).forEach((key) => {
            if (key && key.trim() && key !== '__index') {
              allKeys.add(key)
            }
          })
        }
      })

      // Check for new columns and add them (but exclude deleted columns)
      const existingIds = new Set(columnConfigs.map((c) => c.id))
      
      const newKeys = Array.from(allKeys).filter((key) => {
        // Exclude if already in configs
        if (existingIds.has(key)) {
          return false
        }
        // Exclude if in deleted list
        if (deletedColumnIds.has(key)) {
          return false
        }
        return true
      })

      if (newKeys.length > 0) {
        // Add new columns to the end (old system only)
        const maxOrder = Math.max(...columnConfigs.map((c) => c.order), -1)
        const newConfigs = newKeys.map((key, index) => {
          const sampleValues = leads.slice(0, 50)
            .map((lead) => {
              const value = lead.data?.[key]
              return value ? String(value) : ''
            })
            .filter((v) => v.length > 0)

          const maxLength = Math.max(
            key.length,
            ...sampleValues.map((v) => v.length)
          )

          const estimatedWidth = Math.min(Math.max(maxLength * 8 + 40, 120), 400)

          return {
            id: key,
            header: key, // Use exact key, no formatting
            width: estimatedWidth,
            order: maxOrder + 1 + index,
            visible: true, // Keep for backward compatibility, but not used
          }
        })

        const updatedConfigs = [...columnConfigs, ...newConfigs]
        setColumnConfigs(updatedConfigs)
        saveColumnConfig(updatedConfigs)
      }
    }
  }, [leads, board, hasInitialized, columnConfigs, saveColumnConfig, deletedColumnIds])

  // Generate columns from config
  const columns = useMemo<ColumnDef<Lead>[]>(() => {
    if (leads.length === 0) return []

    // If we have column configs, use them
    if (columnConfigs.length > 0) {
      // Sort by order
      const sortedConfigs = [...columnConfigs]
        .sort((a, b) => a.order - b.order)

      const dataColumns: ColumnDef<Lead>[] = sortedConfigs.map((config) => {
        // Helper function to get cell value with fallback logic
        const getCellValue = (row: Lead, columnConfig: ColumnConfig): any => {
          const data = row.data || {}
          
          // Get column name from board.columns if available (for fallback)
          let columnName: string | undefined = undefined
          if (board && Array.isArray(board.columns)) {
            const dbColumn = (board.columns as any[]).find((col: any) => 
              col.id === columnConfig.id || col.name === columnConfig.id || col.name === columnConfig.header
            )
            columnName = dbColumn?.name
          }
          
          // PRAGMATIC PROGRAMMER: Single Source of Truth
          // Client is "dumb" - only displays what server provides
          // Server stores data using column UUID, client accesses by UUID only
          // No fallback logic - if UUID doesn't exist, data doesn't exist
          return data[columnConfig.id] ?? undefined
        }

        return {
          id: config.id,
          accessorFn: (row: Lead) => {
            // Use smart reader with fallback logic
            const value = getCellValue(row, config)
            
            // Handle AI rich text objects
            if (value && typeof value === 'object' && value.type === 'ai_rich_text') {
              return value.value || ''
            }
            // Handle DropContact results
            if (value && typeof value === 'object' && value.type === 'dropcontact_result') {
              return value.email || value.qualification || ''
            }
            // Handle DropContact pending (will show loading indicator via processing state)
            if (value && typeof value === 'object' && value.type === 'dropcontact_pending') {
              return '' // Empty string will show loading indicator
            }
            return value !== undefined && value !== null ? String(value) : ''
          },
          header: config.header,
          size: config.width,
          enableSorting: true,
          sortingFn: (rowA: Row<Lead>, rowB: Row<Lead>) => {
            // Use smart reader with fallback logic for sorting
            const getCellValue = (row: Lead, columnConfig: ColumnConfig): any => {
              const data = row.data || {}
              
              // Get column info from board.columns
              let columnUuid: string | undefined = undefined
              let columnName: string | undefined = undefined
              if (board && Array.isArray(board.columns)) {
                const dbColumn = (board.columns as any[]).find((col: any) => 
                  col.id === columnConfig.id || col.name === columnConfig.id || col.name === columnConfig.header
                )
                if (dbColumn) {
                  columnUuid = dbColumn.id
                  columnName = dbColumn.name
                }
              }
              
              // PRAGMATIC PROGRAMMER: Single Source of Truth
              // Client is "dumb" - only displays what server provides
              // Use column UUID (columnConfig.id) - no fallbacks
              return data[columnConfig.id] ?? undefined
            }
            
            let aValue = getCellValue(rowA.original, config)
            let bValue = getCellValue(rowB.original, config)
            
            // Handle AI rich text objects - extract the value
            if (aValue && typeof aValue === 'object' && aValue.type === 'ai_rich_text') {
              aValue = aValue.value
            }
            if (bValue && typeof bValue === 'object' && bValue.type === 'ai_rich_text') {
              bValue = bValue.value
            }
            // Handle DropContact results - extract the email
            if (aValue && typeof aValue === 'object' && aValue.type === 'dropcontact_result') {
              aValue = aValue.email || aValue.qualification || ''
            }
            if (bValue && typeof bValue === 'object' && bValue.type === 'dropcontact_result') {
              bValue = bValue.email || bValue.qualification || ''
            }
            
            // Handle empty/null values - put them at the end
            if (!aValue && !bValue) return 0
            if (!aValue) return 1
            if (!bValue) return -1
            
            // Convert to strings for comparison
            const aStr = String(aValue).toLowerCase()
            const bStr = String(bValue).toLowerCase()
            
            // Try numeric comparison first
            const aNum = parseFloat(aStr)
            const bNum = parseFloat(bStr)
            if (!isNaN(aNum) && !isNaN(bNum)) {
              return aNum - bNum
            }
            
            // Fall back to string comparison
            return aStr.localeCompare(bStr)
          },
          cell: ({ getValue, row }) => {
            const displayValue = getValue<string>()
            const leadId = row.original.id
            const columnId = config.id // This is the column UUID (from board_columns.id)
            
            // Smart reader with fallback logic
            const getCellValue = (row: Lead, columnConfig: ColumnConfig): any => {
              const data = row.data || {}
              
              // Get column info from board.columns
              let columnUuid: string | undefined = undefined
              let columnName: string | undefined = undefined
              if (board && Array.isArray(board.columns)) {
                const dbColumn = (board.columns as any[]).find((col: any) => 
                  col.id === columnConfig.id || 
                  col.name === columnConfig.id || 
                  col.name === columnConfig.header ||
                  (columnConfig.columnId && col.id === columnConfig.columnId)
                )
                if (dbColumn) {
                  columnUuid = dbColumn.id // UUID from database
                  columnName = dbColumn.name // Name from database
                }
              }
              
              // PRAGMATIC PROGRAMMER: Single Source of Truth
              // Client is "dumb" - only displays what server provides
              // Server stores data using column UUID, client accesses by UUID only
              // columnConfig.id is always UUID (set by server/API)
              return data[columnConfig.id] ?? undefined
            }
            
            let rawValue = getCellValue(row.original, config)
            
            
            // Check if value is an AI-rich-text object
            const isAIRichText = rawValue && typeof rawValue === 'object' && rawValue.type === 'ai_rich_text'
            const actualValue = isAIRichText ? rawValue.value : displayValue
            
            const isEditing = editingCell?.leadId === leadId && editingCell?.columnId === columnId
            // CRITICAL: Use column UUID directly for loading check
            // processingColumnId should be the UUID of the column being processed
            const isLoading = processingColumnId === columnId && processingLeads.has(leadId)

            // Show loading state
            if (isLoading) {
              return (
                <div className="text-sm text-muted-foreground italic whitespace-nowrap">
                  Loading...
                </div>
              )
            }

            // Handle cell editing
            if (isEditing) {
              return (
                <EditableCell
                  initialValue={actualValue || ''}
                  leadId={leadId}
                  columnId={columnId}
                  onSave={async (newValue) => {
                    try {
                      // Optimistic update
                      setLeads((prevLeads) =>
                        prevLeads.map((lead) =>
                          lead.id === leadId
                            ? {
                                ...lead,
                                data: {
                                  ...lead.data,
                                  [columnId]: newValue,
                                },
                              }
                            : lead
                        )
                      )

                      // API call
                      const headers = getAuthHeaders()
                      const response = await fetch(`/api/leads/${leadId}`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify({
                          path: columnId,
                          value: newValue,
                        }),
                      })

                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: 'Failed to update cell' }))
                        throw new Error(errorData.message || 'Failed to update cell')
                      }

                      setEditingCell(null)
                    } catch (error) {
                      // Revert optimistic update
                      setLeads((prevLeads) =>
                        prevLeads.map((lead) =>
                          lead.id === leadId
                            ? {
                                ...lead,
                                data: {
                                  ...lead.data,
                                  [columnId]: actualValue || '',
                                },
                              }
                            : lead
                        )
                      )
                      setToast({
                        message: error instanceof Error ? error.message : 'Failed to update cell',
                        variant: 'destructive',
                      })
                      setEditingCell(null)
                    }
                  }}
                  onCancel={() => setEditingCell(null)}
                />
              )
            }

            // Display mode
            const handleDoubleClick = () => {
              setEditingCell({ leadId, columnId })
            }

            const handleClick = () => {
              setSelectedCell({
                lead: row.original,
                columnId,
                columnName: config.header,
                value: rawValue,
              })
            }

            if (!actualValue || actualValue === '') {
              return (
                <div 
                  className="text-sm text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis cursor-cell hover:bg-muted/40 transition-colors"
                  onDoubleClick={handleDoubleClick}
                  onClick={handleClick}
                  title="Double-click to edit, click to view details"
                >
                  -
                </div>
              )
            }

            const stringValue = String(actualValue)

            if (isUrl(stringValue)) {
              return (
                <a
                  href={stringValue}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline whitespace-nowrap overflow-hidden text-ellipsis block cursor-cell hover:bg-muted/40 transition-colors relative"
                  title={stringValue}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    handleDoubleClick()
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    handleClick()
                  }}
                >
                  {stringValue}
                  {isAIRichText && (
                    <span className="absolute top-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-purple-500 pointer-events-none" />
                  )}
                </a>
              )
            }

            const truncatedValue = stringValue.length > 100 
              ? stringValue.substring(0, 100) + '...'
              : stringValue

            return (
              <div 
                className="text-sm whitespace-nowrap overflow-hidden text-ellipsis cursor-cell hover:bg-muted/40 transition-colors relative"
                title={stringValue}
                onDoubleClick={handleDoubleClick}
                onClick={handleClick}
              >
                {truncatedValue}
                {isAIRichText && (
                  <span className="absolute top-0 right-0 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-purple-500 pointer-events-none" />
                )}
              </div>
            )
          },
        } as ColumnDef<Lead>
      })

      const rowSelectColumn: ColumnDef<Lead> = {
        id: '__select',
        header: () => null,
        size: ROW_SELECT_COL_WIDTH,
        minSize: ROW_SELECT_COL_WIDTH,
        maxSize: ROW_SELECT_COL_WIDTH,
        enableResizing: false,
        enableSorting: false,
        // Checkbox is rendered in DataRow (needs selection props + memo-friendly updates)
        cell: () => null,
      }

      // Add row index column
      const rowIndexColumn: ColumnDef<Lead> = {
        id: '__index',
        header: '#',
        size: 60,
        enableResizing: false,
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <div className="text-sm text-center text-muted-foreground tabular-nums">
              {row.index + 1}
            </div>
          )
        },
      }

      return [rowSelectColumn, rowIndexColumn, ...dataColumns]
    }

    // Fallback: generate from data (shouldn't happen if config exists)
    return []
  }, [leads, columnConfigs, editingCell, board])

  // Handle TanStack Table's internal column sizing changes.
  // Only updates the lightweight columnSizing state — no columnConfigs sync here.
  const handleColumnSizingChange = useCallback((updater: any) => {
    setColumnSizing((prevSizing) => {
      let newSizing: Record<string, number> = {}
      if (typeof updater === 'function') {
        newSizing = updater(prevSizing)
      } else if (typeof updater === 'object' && updater !== null) {
        newSizing = updater
      } else {
        return prevSizing
      }
      return { ...prevSizing, ...newSizing }
    })
  }, [])

  // Handle column resize from ColumnHeader (called on every mousemove during drag).
  // Only updates columnSizing so headers re-render at 60fps. DataRow memos bail out
  // because columnConfigs reference stays the same.
  const handleColumnResize = useCallback((columnId: string, newWidth: number) => {
    setColumnSizing((prevSizing) => ({
      ...prevSizing,
      [columnId]: newWidth,
    }))
  }, [])

  // Handle column resize end (called once on mouseup).
  // This is the "heavy" update: writes new widths into columnConfigs (triggers DataRow
  // re-renders) and persists to the database via the debounced saver.
  const handleColumnResizeEnd = useCallback((columnId: string, newWidth: number) => {
    setColumnConfigs((prevConfigs) => {
      const updatedConfigs = prevConfigs.map((config) => {
        if (config.id === columnId) {
          return { ...config, width: newWidth }
        }
        return config
      })
      saveColumnConfigDebounced(updatedConfigs)
      return updatedConfigs
    })
  }, [saveColumnConfigDebounced])

  // Column sizing state for TanStack Table
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>({})

  // Sync column sizing from configs (initial load & external config changes)
  useEffect(() => {
    const sizing: Record<string, number> = {
      __select: ROW_SELECT_COL_WIDTH,
      __index: 60,
    }
    columnConfigs.forEach((config) => {
      sizing[config.id] = config.width
    })
    setColumnSizing(sizing)
  }, [columnConfigs])

  // Pre-computed Map passed to every DataRow so individual rows don't each build their own.
  // Only recomputed when columnConfigs reference changes (not on every sizing tick).
  const columnConfigMap = useMemo(
    () => new Map(columnConfigs.map((c) => [c.id, c])),
    [columnConfigs]
  )

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
      columnSizing,
    },
    columnResizeMode,
    onColumnSizingChange: handleColumnSizingChange,
    defaultColumn: {
      minSize: 50,
      maxSize: 800,
    },
  })

  const { rows } = table.getRowModel()

  const [parentRef, setParentRef] = useState<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef,
    estimateSize: () => 35,
    overscan: 10,
  })

  const getVisibleLeadIds = useCallback(() => {
    return rowVirtualizer
      .getVirtualItems()
      .map((vi) => rows[vi.index]?.original?.id)
      .filter((id): id is string => !!id)
  }, [rowVirtualizer, rows])

  useEffect(() => {
    if (!rowContextMenu) return
    const closeMouse = (e: MouseEvent) => {
      if (e.button !== 0) return
      setRowContextMenu(null)
    }
    const closeScroll = () => setRowContextMenu(null)
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', closeMouse)
      document.addEventListener('scroll', closeScroll, true)
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', closeMouse)
      document.removeEventListener('scroll', closeScroll, true)
    }
  }, [rowContextMenu])

  // Handle column reorder
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    // Sort configs by order first to ensure we're working with the correct order
    const sortedConfigs = [...columnConfigs].sort((a, b) => a.order - b.order)
    
    const oldIndex = sortedConfigs.findIndex((c) => c.id === active.id)
    const newIndex = sortedConfigs.findIndex((c) => c.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const newConfigs = arrayMove(sortedConfigs, oldIndex, newIndex)
    // Update order indices to match new positions
    const updatedConfigs = newConfigs.map((config, index) => ({
      ...config,
      order: index,
    }))
    
    setColumnConfigs(updatedConfigs)
    void persistColumnOrder(updatedConfigs)
  }


  // Handle opening rename dialog
  const handleOpenRenameDialog = (columnConfig: ColumnConfig) => {
    if (!board) return
    
    // Find the column UUID from board.columns
    const isNewSystem = Array.isArray(board.columns) && 
                       board.columns.length > 0 && 
                       board.columns[0]?.hasOwnProperty('name') && 
                       board.columns[0]?.hasOwnProperty('type')
    
    if (isNewSystem) {
      const column = Array.isArray(board.columns) 
        ? (board.columns as any[]).find((col: any) => col.name === columnConfig.id || col.id === columnConfig.id)
        : null
      
      if (column) {
        setColumnToRename({
          id: column.id,
          name: columnConfig.header || columnConfig.id,
          columnId: columnConfig.id,
        })
        setRenameValue(columnConfig.header || columnConfig.id)
        setIsRenameDialogOpen(true)
      }
    } else {
      // Old system - use the config id directly
      setColumnToRename({
        id: columnConfig.id,
        name: columnConfig.header || columnConfig.id,
        columnId: columnConfig.id,
      })
      setRenameValue(columnConfig.header || columnConfig.id)
      setIsRenameDialogOpen(true)
    }
  }

  // Handle saving rename
  const handleSaveRename = async () => {
    if (!columnToRename || !renameValue.trim()) {
      return
    }

    await handleColumnRename(columnToRename.columnId, renameValue.trim())
    setIsRenameDialogOpen(false)
    setColumnToRename(null)
    setRenameValue('')
  }


  // Handle AI column configuration
  const handleAIConfig = (columnConfig: ColumnConfig) => {
    // Find the full column data from board.columns (which includes the database config)
    if (board && Array.isArray(board.columns)) {
      const dbColumn = (board.columns as any[]).find((col: any) => col.name === columnConfig.id || col.id === columnConfig.id)
      if (dbColumn) {
        // Use the database column which has the full config (model, messages, etc.)
        setSelectedAIColumn({
          ...columnConfig,
          columnId: dbColumn.id,
          config: dbColumn.config || {},
        })
        setIsAIConfigModalOpen(true)
        return
      }
    }
    // Fallback to columnConfig if board.columns not available
    setSelectedAIColumn(columnConfig)
    setIsAIConfigModalOpen(true)
  }

  // Handle DropContact column configuration
  const handleDropContactConfig = (columnConfig: ColumnConfig) => {
    // Find the full column data from board.columns
    if (board && Array.isArray(board.columns)) {
      const dbColumn = (board.columns as any[]).find((col: any) => col.name === columnConfig.id || col.id === columnConfig.id)
      if (dbColumn) {
        setSelectedDropContactColumn({
          ...columnConfig,
          columnId: dbColumn.id,
          config: dbColumn.config || {},
        })
        setIsDropContactMappingModalOpen(true)
        return
      }
    }
    // Fallback to columnConfig if board.columns not available
    setSelectedDropContactColumn(columnConfig)
    setIsDropContactMappingModalOpen(true)
  }

  // Sync selectedAIColumn with board data when board changes (after save/refresh)
  useEffect(() => {
    if (!selectedAIColumn || !board || !Array.isArray(board.columns)) {
      return
    }

    // Find the updated column from board.columns
    const updatedColumn = (board.columns as any[]).find((col: any) => col.name === selectedAIColumn.id || col.id === selectedAIColumn.id || col.id === selectedAIColumn.columnId)
    if (updatedColumn) {
      // Only update if the config actually changed to avoid infinite loops
      const newConfig = updatedColumn.config || {}
      const currentConfig = selectedAIColumn.config || {}
      
      // Don't overwrite with empty config if we already have a config
      // This prevents clearing the config when board refresh happens before database commit
      if (Object.keys(newConfig).length === 0 && Object.keys(currentConfig).length > 0) {
        console.log('⚠️ Board refresh returned empty config, keeping current config:', {
          columnId: updatedColumn.id,
          currentModel: currentConfig.model,
          currentHasMessages: !!currentConfig.messages,
        })
        // Only update columnId if it changed, but keep the existing config
        if (updatedColumn.id !== selectedAIColumn.columnId) {
          setSelectedAIColumn({
            ...selectedAIColumn,
            columnId: updatedColumn.id,
          })
        }
        return
      }
      
      // Check if config actually changed
      const configChanged = JSON.stringify(newConfig) !== JSON.stringify(currentConfig)
      const columnIdChanged = updatedColumn.id !== selectedAIColumn.columnId
      
      if (configChanged || columnIdChanged) {
        console.log('🔄 Syncing selectedAIColumn with board data:', {
          columnId: updatedColumn.id,
          model: newConfig.model,
          hasMessages: !!newConfig.messages,
          configChanged,
          columnIdChanged,
          newConfigKeys: Object.keys(newConfig),
          currentConfigKeys: Object.keys(currentConfig),
        })
        // Update selectedAIColumn with fresh data from board
        setSelectedAIColumn({
          ...selectedAIColumn,
          columnId: updatedColumn.id,
          config: newConfig,
        })
      }
    }
  }, [board, selectedAIColumn?.id]) // Include selectedAIColumn.id to ensure we're syncing the right column

  // Wrapper for handleSaveAIConfig to update selectedAIColumn state
  const handleSaveAIConfigWrapper = async (config: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    model: string
    temperature: number
    useWebSearch: boolean
    systemInstruction?: string
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  }) => {
    if (!selectedAIColumn) {
      throw new Error('No column selected')
    }

    // columnId is a UUID from board_columns.id — passed to handleSaveAIConfig
    // so the hook can update the correct row in the board_columns table.
    // NOTE: selectedAIColumn.id is also a UUID (set at initialization time in the
    // useEffect at line ~312). selectedAIColumn.columnId mirrors .id and is kept
    // in sync. Both hold UUIDs, never display names.
    let columnId = selectedAIColumn.columnId // UUID from board_columns.id
    if (!columnId && board && Array.isArray(board.columns)) {
      const column = (board.columns as any[]).find((col: any) => col.name === selectedAIColumn.id)
      if (column && column.id) {
        columnId = column.id // UUID from board_columns.id
        // Update selectedAIColumn with the found columnId
        setSelectedAIColumn({
          ...selectedAIColumn,
          columnId: column.id,
        })
      }
    }

    if (!columnId) {
      throw new Error('No column selected or column ID not found')
    }

    const configToSave = isDemoMode()
      ? { ...config, model: DEMO_MODEL_ID, thinkingLevel: undefined }
      : config

    await handleSaveAIConfig(columnId, configToSave) // columnId is UUID from board_columns.id
    
    // Don't update selectedAIColumn here - let the useEffect sync with board data after refresh
    // This ensures we get the actual saved data from the database, not optimistic updates
  }

  // Run DropContact enrichment column
  const handleRunDropContactColumn = async (rowLimit: number | 'all', excludeProcessed: boolean = true) => {
    if (!selectedDropContactColumn) {
      throw new Error('No DropContact column selected')
    }

    const effectiveRowLimit = isDemoMode() ? DEMO_MAX_ROWS : rowLimit

    // columnId (UUID from board_columns.id) — sent to the /api/enrich/dropcontact POST
    // body so the server knows which column to write results into.
    let columnId = selectedDropContactColumn.columnId // UUID from board_columns.id
    if (!columnId && board && Array.isArray(board.columns)) {
      const column = (board.columns as any[]).find((col: any) => col.name === selectedDropContactColumn.id)
      if (column && column.id) {
        columnId = column.id // UUID from board_columns.id
      }
    }

    if (!columnId) {
      throw new Error('No column selected or column ID not found')
    }

    // Get mapping from column config
    const mapping = (selectedDropContactColumn as any)?.config?.metadata?.mapping || {}
    if (!mapping.firstNameColId || !mapping.lastNameColId || !mapping.companyColId) {
      throw new Error('Column mapping not configured. Please configure the column mapping first.')
    }

    // columnUuid (UUID from board_columns.id) — used client-side to key into lead.data
    // and to set processingColumnId so the loading spinner renders for the right column.
    // NOTE: columnId and columnUuid are both UUIDs and should always be equal when both
    // are resolved. They exist as separate variables for historical reasons (columnId feeds
    // the API body; columnUuid feeds the client-side processing state).
    const columnUuid = selectedDropContactColumn.id // UUID from board_columns.id
    
    if (!columnUuid) {
      setToast({ message: 'Column UUID not found', variant: 'destructive' })
      return
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(columnUuid)) {
      setToast({ message: 'Invalid column UUID format', variant: 'destructive' })
      return
    }

    // Set up loading state using UUID
    setProcessingColumnId(columnUuid)
    processingColumnIdRef.current = columnUuid
    processingColumnNameRef.current = selectedDropContactColumn.header || columnUuid

    const sortedRows = table.getRowModel().rows
    const loadedCount = sortedRows.length
    const needsWideFetch =
      totalRows > loadedCount &&
      (effectiveRowLimit === 'all' ||
        (typeof effectiveRowLimit === 'number' && effectiveRowLimit > loadedCount))

    let rowsForRun: { original: Lead }[]
    try {
      if (needsWideFetch) {
        const fetchCap =
          effectiveRowLimit === 'all'
            ? totalRows
            : Math.min(effectiveRowLimit, totalRows)
        setToast({ message: `Loading ${fetchCap} row${fetchCap === 1 ? '' : 's'} for DropContact…` })
        const wideLeads = await fetchLeadsForEnrichmentRun(params.id, fetchCap, getAuthHeaders)
        rowsForRun = wideLeads.map((lead) => ({ original: lead }))
      } else {
        rowsForRun = sortedRows as { original: Lead }[]
      }
    } catch (e) {
      setProcessingColumnId(null)
      processingColumnIdRef.current = null
      throw e
    }

    // Client is "dumb" - uses UUID directly, no transformation
    const isPendingRow = (row: any): boolean => {
      const columnValue = row.original.data?.[columnUuid]
      if (columnValue === undefined || columnValue === null) return true
      if (columnValue === '') return true
      if (typeof columnValue === 'object' && columnValue.type === 'dropcontact_pending') return true
      if (typeof columnValue === 'object' && columnValue.type === 'dropcontact_result' && !columnValue.email) return true
      return false
    }

    let targetRowIds: string[] = []

    if (excludeProcessed) {
      const pendingRows = rowsForRun.filter(isPendingRow)
      const limit = typeof effectiveRowLimit === 'number' ? effectiveRowLimit : pendingRows.length
      const rowsToProcess = pendingRows.slice(0, limit)
      targetRowIds = rowsToProcess.map((row) => row.original.id)

      if (targetRowIds.length === 0) {
        throw new Error(
          'No pending rows to process. Turn off "Exclude already processed" to re-run, or all rows already have data.'
        )
      }
    } else {
      const limit = typeof effectiveRowLimit === 'number' ? effectiveRowLimit : rowsForRun.length
      const rowsToProcess = rowsForRun.slice(0, limit)
      targetRowIds = rowsToProcess.map((row) => row.original.id)

      if (targetRowIds.length === 0) {
        throw new Error('No rows selected for processing')
      }
    }

    const leadById = new Map(rowsForRun.map((r) => [r.original.id, r.original]))

    // Set up processing state
    const processingSet = new Set(targetRowIds)
    setProcessingLeads(processingSet)
    processingLeadsRef.current = new Set(processingSet)

    const message = excludeProcessed 
      ? `Running DropContact enrichment for "${selectedDropContactColumn.header}" on ${targetRowIds.length} pending row${targetRowIds.length === 1 ? '' : 's'}...`
      : `Running DropContact enrichment for "${selectedDropContactColumn.header}" on ${targetRowIds.length} row${targetRowIds.length === 1 ? '' : 's'}...`
    setToast({ message })

    // FRONTEND-DRIVEN: Process rows using frontend-calculated rowIds
    // Extract data for each row and call API
    const processPromises = targetRowIds.map(async (rowId) => {
      const leadRow = leadById.get(rowId)
      if (!leadRow) {
        console.warn(`Row ${rowId} not found in enrichment row set`)
        return
      }

      // Extract values from mapped columns (normalize column IDs to match data keys)
      const firstNameColKey = mapping.firstNameColId.toLowerCase().replace(/\s+/g, '_')
      const lastNameColKey = mapping.lastNameColId.toLowerCase().replace(/\s+/g, '_')
      const companyColKey = mapping.companyColId.toLowerCase().replace(/\s+/g, '_')
      const websiteColKey = mapping.websiteColId ? mapping.websiteColId.toLowerCase().replace(/\s+/g, '_') : null

      // Try normalized key first, then exact match
      const firstName = leadRow.data?.[firstNameColKey] || leadRow.data?.[mapping.firstNameColId] || ''
      const lastName = leadRow.data?.[lastNameColKey] || leadRow.data?.[mapping.lastNameColId] || ''
      const company = leadRow.data?.[companyColKey] || leadRow.data?.[mapping.companyColId] || ''
      const website = websiteColKey ? (leadRow.data?.[websiteColKey] || leadRow.data?.[mapping.websiteColId] || '') : ''

      // Handle AI enrichment results (extract value if it's an object)
      const extractValue = (val: any): string => {
        if (typeof val === 'object' && val !== null && val.type === 'ai_rich_text') {
          return val.value || ''
        }
        return val || ''
      }

      const cleanFirstName = extractValue(firstName)
      const cleanLastName = extractValue(lastName)
      const cleanCompany = extractValue(company)
      const cleanWebsite = extractValue(website)

      // Call DropContact API
      const headers = getAuthHeaders()
      const response = await fetch('/api/enrich/dropcontact', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rowId: rowId,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          company: cleanCompany,
          website: cleanWebsite,
          columnId: columnId,
          boardId: params.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to start DropContact enrichment' }))
        throw new Error(errorData.message || 'Failed to start DropContact enrichment')
      }
    })

    await Promise.all(processPromises)

    // Start polling for DropContact results
    let pollCount = 0
    const MAX_POLLS = 120 // DropContact can take longer (2 minutes max)

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
    }

    refreshIntervalRef.current = setInterval(async () => {
      try {
        pollCount++
        const currentProcessingSet = processingLeadsRef.current

        if (pollCount > MAX_POLLS) {
          console.log('⏱️ Maximum poll count reached - stopping DropContact polling')
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current)
            refreshIntervalRef.current = null
          }
          isRunningRef.current = false
          setProcessingColumnId(null)
          processingColumnIdRef.current = null
          setProcessingLeads(new Set())
          processingLeadsRef.current = new Set()
          setToast({ message: 'DropContact polling timeout - some requests may still be processing' })
          return
        }

        if (currentProcessingSet.size === 0) {
          console.log('✅ No processing state - stopping DropContact polling')
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current)
            refreshIntervalRef.current = null
          }
          return
        }

        // Fetch updated leads
        const dcPollHeaders = getAuthHeaders()
        const response = await fetch(`/api/leads?board_id=${params.id}`, { headers: dcPollHeaders })
        if (response.ok) {
          const data = await response.json()
          const updatedLeads: Lead[] = data.leads || []

          const stillProcessing = new Set<string>()
          const pendingRequestIds = new Map<string, string>() // rowId -> requestId

          // Check each processing lead
          // Use UUID directly - client is "dumb", no transformation
          updatedLeads.forEach((lead: Lead) => {
            if (currentProcessingSet.has(lead.id)) {
              const columnValue = lead.data?.[columnUuid] as any

              if (columnValue && typeof columnValue === 'object' && columnValue.type === 'dropcontact_pending') {
                // Still processing - check status via API
                stillProcessing.add(lead.id)
                if (columnValue.requestId) {
                  pendingRequestIds.set(lead.id, columnValue.requestId)
                }
              } else if (columnValue && typeof columnValue === 'object' && columnValue.type === 'dropcontact_result') {
                // Completed
                console.log(`✅ Lead ${lead.id} completed - Email: ${columnValue.email || 'Not found'}`)
              } else {
                // Still waiting for initial response
                stillProcessing.add(lead.id)
              }
            }
          })

          // Check status of pending requests
          for (const [rowId, requestId] of pendingRequestIds.entries()) {
            try {
              const statusHeaders = getAuthHeaders()
              const statusResponse = await fetch(
                `/api/enrich/dropcontact?request_id=${encodeURIComponent(requestId)}&board_id=${encodeURIComponent(params.id)}`,
                { headers: statusHeaders }
              )
              if (statusResponse.ok) {
                const statusData = await statusResponse.json()
                if (statusData.success && statusData.status === 'completed') {
                  // Result was updated in database by the API
                  console.log(`✅ DropContact request ${requestId} completed`)
                }
              }
            } catch (error) {
              console.error(`Error checking DropContact status for request ${requestId}:`, error)
            }
          }

          setProcessingLeads(stillProcessing)
          processingLeadsRef.current = stillProcessing

          // Update leads state
          setLeads((prevLeads) => {
            const updatedMap = new Map(updatedLeads.map(lead => [lead.id, lead]))
            const merged = prevLeads.map(lead => {
              const updated = updatedMap.get(lead.id)
              if (updated) {
                return {
                  ...updated,
                  data: { ...updated.data },
                }
              }
              return {
                ...lead,
                data: { ...lead.data },
              }
            })
            updatedLeads.forEach(lead => {
              if (!prevLeads.find(l => l.id === lead.id)) {
                merged.push({
                  ...lead,
                  data: { ...lead.data },
                })
              }
            })
            return [...merged]
          })

          if (stillProcessing.size === 0) {
            console.log('✅ All DropContact requests completed')
            if (refreshIntervalRef.current) {
              clearInterval(refreshIntervalRef.current)
              refreshIntervalRef.current = null
            }
            isRunningRef.current = false
            setProcessingColumnId(null)
            processingColumnIdRef.current = null
            setProcessingLeads(new Set())
            processingLeadsRef.current = new Set()
            setToast({ message: `DropContact enrichment completed for "${selectedDropContactColumn.header}"` })
          }
        }
      } catch (error) {
        console.error('Error polling DropContact updates:', error)
        // CRITICAL: Clear the interval on error to prevent a memory leak.
        // Without this, the interval would keep firing indefinitely even though
        // the polling is broken, holding refs and closures alive after unmount.
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
          refreshIntervalRef.current = null
        }
        isRunningRef.current = false
        setProcessingColumnId(null)
        processingColumnIdRef.current = null
        setProcessingLeads(new Set())
        processingLeadsRef.current = new Set()
      }
    }, 5000) // Poll every 5 seconds for DropContact
  }

  // Run AI enrichment column with client-side chunking for large datasets
  const handleRunAIColumn = async (rowLimit: number | 'all', excludeProcessed: boolean = true) => {
    if (!selectedAIColumn) {
      throw new Error('No column selected')
    }

    const effectiveRowLimit = isDemoMode() ? DEMO_MAX_ROWS : rowLimit

    // Prevent multiple simultaneous runs
    if (isRunningRef.current) {
      throw new Error('Enrichment is already running. Please wait for it to complete.')
    }

    // columnId (UUID from board_columns.id) — sent to the /api/enrich/start POST body
    // so the server knows which column to write AI results into.
    let columnId = selectedAIColumn.columnId // UUID from board_columns.id
    if (!columnId && board && Array.isArray(board.columns)) {
      const column = (board.columns as any[]).find((col: any) => col.name === selectedAIColumn.id)
      if (column && column.id) {
        columnId = column.id // UUID from board_columns.id
        // Update selectedAIColumn with the found columnId
        setSelectedAIColumn({
          ...selectedAIColumn,
          columnId: column.id,
        })
      }
    }

    if (!columnId) {
      throw new Error('No column selected or column ID not found')
    }

    // columnUuid (UUID from board_columns.id) — used client-side to key into lead.data
    // and to set processingColumnId for the loading spinner.
    // NOTE: columnId and columnUuid are both UUIDs and should always be equal when both
    // are resolved. They exist as separate variables for historical reasons.
    const columnUuid = selectedAIColumn.id // UUID from board_columns.id
    
    if (!columnUuid) {
      setToast({ message: 'Column UUID not found', variant: 'destructive' })
      return
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(columnUuid)) {
      setToast({ message: 'Invalid column UUID format', variant: 'destructive' })
      return
    }

    // Set up loading state using UUID
    setProcessingColumnId(columnUuid)
    processingColumnIdRef.current = columnUuid
    processingColumnNameRef.current = selectedAIColumn.header || columnUuid
    isRunningRef.current = true

    const isPendingRow = (row: any): boolean => {
      const columnValue = row.original.data?.[columnUuid]

      if (columnValue === undefined || columnValue === null) return true
      if (columnValue === '') return true
      if (typeof columnValue === 'object' && Object.keys(columnValue).length === 0) return true
      if (typeof columnValue === 'object' && 'value' in columnValue) {
        const value = columnValue.value
        return !value || value === '' || value === 'ERROR' || value === null || value === undefined
      }
      if (typeof columnValue === 'string') {
        return columnValue.trim() === '' || columnValue === 'ERROR'
      }
      if (!columnValue) return true
      return false
    }

    let totalRowsToProcess: number
    let allPendingRowIds: string[] = []

    if (effectiveRowLimit === 'all') {
      try {
        setToast({ message: 'Loading all row IDs from database…' })
        const dbIds = await fetchAllLeadIdsForBoard(params.id, getAuthHeaders)
        const leadById = new Map(leads.map((l) => [l.id, l]))

        const pendingForId = (id: string): boolean => {
          const lead = leadById.get(id)
          if (!lead) return true
          return isPendingRow({ original: lead })
        }

        if (excludeProcessed) {
          allPendingRowIds = dbIds.filter(pendingForId)
          totalRowsToProcess = allPendingRowIds.length
          if (allPendingRowIds.length === 0) {
            isRunningRef.current = false
            setProcessingColumnId(null)
            processingColumnIdRef.current = null
            throw new Error(
              'No pending rows to process. Turn off "Exclude already processed" to re-run, or all rows already have data.'
            )
          }
          console.log(
            `📋 ALL ROWS (DB IDs): ${dbIds.length} total, ${allPendingRowIds.length} pending after filter`
          )
        } else {
          allPendingRowIds = dbIds
          totalRowsToProcess = dbIds.length
          if (allPendingRowIds.length === 0) {
            isRunningRef.current = false
            setProcessingColumnId(null)
            processingColumnIdRef.current = null
            throw new Error('No rows on this board')
          }
          console.log(`📋 ALL ROWS (DB IDs): processing ${allPendingRowIds.length} rows`)
        }
      } catch (e) {
        isRunningRef.current = false
        setProcessingColumnId(null)
        processingColumnIdRef.current = null
        throw e
      }
    } else {
      const sortedRows = table.getRowModel().rows
      const loadedCount = sortedRows.length
      const needsWideFetch =
        totalRows > loadedCount &&
        typeof effectiveRowLimit === 'number' &&
        effectiveRowLimit > loadedCount

      let rowsForRun: { original: Lead }[]
      try {
        if (needsWideFetch) {
          const fetchCap = Math.min(effectiveRowLimit, totalRows)
          setToast({ message: `Loading ${fetchCap} row${fetchCap === 1 ? '' : 's'} for enrichment…` })
          const wideLeads = await fetchLeadsForEnrichmentRun(params.id, fetchCap, getAuthHeaders)
          rowsForRun = wideLeads.map((lead) => ({ original: lead }))
        } else {
          rowsForRun = sortedRows as { original: Lead }[]
        }
      } catch (e) {
        isRunningRef.current = false
        setProcessingColumnId(null)
        processingColumnIdRef.current = null
        throw e
      }

      if (excludeProcessed) {
        const pendingRows = rowsForRun.filter(isPendingRow)
        totalRowsToProcess = Math.min(effectiveRowLimit, pendingRows.length)
        allPendingRowIds = pendingRows.slice(0, totalRowsToProcess).map((row) => row.original.id)

        if (allPendingRowIds.length === 0) {
          isRunningRef.current = false
          setProcessingColumnId(null)
          processingColumnIdRef.current = null
          throw new Error(
            'No pending rows to process. Turn off "Exclude already processed" to re-run, or all rows already have data.'
          )
        }

        console.log(
          `📋 FRONTEND FILTER: Found ${pendingRows.length} pending rows (${needsWideFetch ? 'board fetch' : 'table view'}), will process ${allPendingRowIds.length}`
        )
      } else {
        totalRowsToProcess = effectiveRowLimit
        allPendingRowIds = rowsForRun.slice(0, totalRowsToProcess).map((row) => row.original.id)

        if (allPendingRowIds.length === 0) {
          isRunningRef.current = false
          setProcessingColumnId(null)
          processingColumnIdRef.current = null
          throw new Error('No rows selected for processing')
        }

        console.log(
          `📋 Processing ${allPendingRowIds.length} rows (${needsWideFetch ? 'board order from API' : 'current table order'})`
        )
      }
    }
    
    // CLIENT-SIDE CHUNKING: Small batches for Vercel Hobby (10s serverless limit)
    const BATCH_SIZE = 5
    const totalBatches = Math.ceil(allPendingRowIds.length / BATCH_SIZE)
    let totalProcessed = 0
    let allProcessedRowIds = new Set<string>()
    // Flag used by the finally block to skip starting the polling interval
    // when the batch loop threw an error (the catch block already cleaned up state).
    let batchLoopSucceeded = false

    // Initialize progress
    setProcessingProgress({ current: 0, total: totalRowsToProcess })
    setProcessingLeads(new Set(allPendingRowIds))
    processingLeadsRef.current = new Set(allPendingRowIds)

    setToast({
      message: `Batching... (0 / ${totalRowsToProcess} rows)`
    })

    try {
      // Process in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE
        const batchEnd = Math.min(batchStart + BATCH_SIZE, allPendingRowIds.length)
        const batchRowIds = allPendingRowIds.slice(batchStart, batchEnd)
        
        console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches}: ${batchRowIds.length} rows`)
        
        // Update progress
        setProcessingProgress({ current: totalProcessed, total: totalRowsToProcess })
        setToast({ 
          message: `Batching... (${totalProcessed} / ${totalRowsToProcess} rows)` 
        })

        // Call API with this batch
        const headers = getAuthHeaders()
        const response = await fetch('/api/enrich/start', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            boardId: params.id,
            columnId: columnId,
            rowIds: batchRowIds, // Send only this batch
            limit: BATCH_SIZE, // Backend should respect this
            excludeProcessed: false, // We already filtered on frontend
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Failed to start enrichment' }))
          const msg = errorData.message || 'Unknown error'
          if (response.status === 429) {
            throw new Error(
              `Rate limited (${msg}). The app sends one request per small batch; wait ~1 minute, then continue or run again.`
            )
          }
          throw new Error(msg || `Failed to process batch ${batchIndex + 1}`)
        }

        const result = await response.json()
        const processedCount =
          typeof result.stats?.updated === 'number'
            ? result.stats.updated
            : typeof result.processed === 'number'
              ? result.processed
              : batchRowIds.length
        
        totalProcessed += processedCount
        batchRowIds.forEach(id => allProcessedRowIds.add(id))
        
        console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed: ${processedCount} rows processed`)
        
        // If no rows were processed, break early (no more pending rows)
        if (processedCount === 0) {
          console.log(`⚠️ Batch ${batchIndex + 1} returned 0 processed rows - stopping early`)
          break
        }
        
        // Small delay between batches to be kind to the database
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      console.log(`✅ All batches completed: ${totalProcessed} / ${totalRowsToProcess} rows processed`)
      batchLoopSucceeded = true

      // Update final progress
      setProcessingProgress({ current: totalProcessed, total: totalRowsToProcess })
      setToast({
        message: `Enrichment completed: ${totalProcessed} / ${totalRowsToProcess} rows processed`
      })

    } catch (error) {
      console.error('Error during batch processing:', error)
      isRunningRef.current = false
      setProcessingProgress(null)
      setProcessingColumnId(null)
      processingColumnIdRef.current = null
      setProcessingLeads(new Set())
      processingLeadsRef.current = new Set()
      throw error
    } finally {
      // Only start the polling interval when the batch loop completed without error.
      // When an error was thrown the catch block already cleared all processing state,
      // so starting a poll here would create a dangling interval (memory leak).
      if (!batchLoopSucceeded) {
        return
      }

      // Clear any previous interval before starting a new one (defensive guard).
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }

      // Start polling immediately to get real-time updates.
      // The interval is self-terminating: it clears itself when all leads are done,
      // when MAX_POLLS is exceeded, or when an in-poll error occurs.
      let pollCount = 0
      const MAX_POLLS = 60 // Maximum 60 polls (60 seconds at 2s interval)

      refreshIntervalRef.current = setInterval(async () => {
      try {
        pollCount++
        const currentColumnId = processingColumnIdRef.current
        const currentProcessingSet = processingLeadsRef.current

        // Safety check: Stop if we've polled too many times
        if (pollCount > MAX_POLLS) {
          console.log('⏱️ Maximum poll count reached - stopping')
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current)
            refreshIntervalRef.current = null
          }
          setProcessingColumnId(null)
          processingColumnIdRef.current = null
          setProcessingLeads(new Set())
          processingLeadsRef.current = new Set()
          isRunningRef.current = false // Allow future enrichment runs
          setToast({ message: 'Polling timeout - please refresh the page to see results' })
          return
        }

        if (!currentColumnId || currentProcessingSet.size === 0) {
          console.log('✅ No processing state - stopping polling')
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current)
            refreshIntervalRef.current = null
          }
          return
        }

        const aiPollHeaders = getAuthHeaders()
        const response = await fetch(`/api/leads?board_id=${params.id}`, { headers: aiPollHeaders })
        if (response.ok) {
          const data = await response.json()
          const updatedLeads: Lead[] = data.leads || []

          // Debug: Log first lead's data keys to help diagnose column name issues
          if (updatedLeads.length > 0 && pollCount <= 3) {
            const firstLead = updatedLeads[0]
            const processingLead = updatedLeads.find((l: Lead) => currentProcessingSet.has(l.id))
            if (processingLead) {
              console.log('🔍 Processing lead data keys:', Object.keys(processingLead.data || {}))
              console.log('🎯 Looking for column:', currentColumnId)
              console.log('📋 Direct lookup result:', processingLead.data?.[currentColumnId])
              console.log('📋 All column values:', Object.entries(processingLead.data || {}).map(([k, v]) => ({
                key: k,
                type: typeof v,
                isObject: typeof v === 'object',
                hasValue: v && typeof v === 'object' && 'value' in v ? v.value : v,
              })))
            }
          }

          const stillProcessing = new Set<string>()
          updatedLeads.forEach((lead: Lead) => {
            if (currentProcessingSet.has(lead.id)) {
              // Try normalized first (how API stores), then exact match, then try variations
              // Backend stores using: column.name.toLowerCase().replace(/\s+/g, '_')
              let columnValue = lead.data?.[currentColumnId] as any
              
              // If not found, try other variations
              if (!columnValue && lead.data) {
                const keys = Object.keys(lead.data)
                
                // Try 1: Normalized key matching
                let matchingKey = keys.find(key => 
                  key.toLowerCase().replace(/\s+/g, '_') === currentColumnId ||
                  key.toLowerCase() === currentColumnId.toLowerCase()
                )
                
                // Try 2: If still not found, look for variable-syntax keys (bug fix for incorrectly named columns)
                // This handles cases where column name was accidentally set to "{{variableName}}"
                if (!matchingKey) {
                  // Extract the variable name from currentColumnId (e.g., "fullname" from "{{fullname}}")
                  const variableName = currentColumnId.replace(/\{\{|\}\}/g, '').toLowerCase()
                  matchingKey = keys.find(key => {
                    const keyWithoutBraces = key.replace(/\{\{|\}\}/g, '').toLowerCase()
                    return keyWithoutBraces === variableName || 
                           key.toLowerCase() === `{{${variableName}}}` ||
                           key.toLowerCase() === currentColumnId.toLowerCase()
                  })
                  
                  if (matchingKey) {
                    console.log(`🔧 Found column value using variable-syntax key: "${matchingKey}" (looking for "${currentColumnId}")`)
                    console.log(`⚠️ This suggests the column was created with a variable name. Consider renaming the column.`)
                  }
                }
                
                if (matchingKey) {
                  columnValue = lead.data[matchingKey]
                  if (!matchingKey.includes('{{')) {
                    console.log(`🔍 Found column value using key variation: "${matchingKey}" (looking for "${currentColumnId}")`)
                  }
                } else if (pollCount <= 3) {
                  // Only log missing keys for first few polls to avoid spam
                  console.log(`⚠️ Lead ${lead.id} - Column "${currentColumnId}" not found. Available keys:`, keys)
                }
              }
              
              let isProcessing = false
              if (!columnValue) {
                isProcessing = true
                if (pollCount <= 3) {
                  console.log(`⏳ Lead ${lead.id} still processing - no value found for column "${currentColumnId}"`)
                }
              } else if (typeof columnValue === 'object' && columnValue.type === 'ai_rich_text') {
                const actualValue = columnValue.value
                if (!actualValue || actualValue === '' || actualValue === 'ERROR') {
                  isProcessing = true
                  if (pollCount <= 3) {
                    console.log(`⏳ Lead ${lead.id} still processing - empty or error value:`, actualValue)
                  }
                } else {
                  console.log(`✅ Lead ${lead.id} completed - Column "${currentColumnId}":`, actualValue.substring(0, 50))
                  // Force a state update to trigger re-render
                  setLeads((prevLeads) => {
                    const updated = prevLeads.map((l) => 
                      l.id === lead.id ? { ...l, data: { ...l.data, [currentColumnId]: columnValue } } : l
                    )
                    return updated
                  })
                }
              } else if (typeof columnValue === 'string') {
                if (columnValue === '' || columnValue === 'ERROR') {
                  isProcessing = true
                  if (pollCount <= 3) {
                    console.log(`⏳ Lead ${lead.id} still processing - empty or error string`)
                  }
                } else {
                  console.log(`✅ Lead ${lead.id} completed - Column "${currentColumnId}":`, columnValue.substring(0, 50))
                }
              } else {
                // Unexpected type - consider it complete to avoid infinite loop
                console.log(`⚠️ Lead ${lead.id} - unexpected column value type:`, typeof columnValue, 'Treating as complete')
              }

              if (isProcessing) {
                stillProcessing.add(lead.id)
              }
            }
          })
          
          if (pollCount <= 5 || stillProcessing.size === 0) {
            console.log(`📊 Poll #${pollCount}: ${stillProcessing.size} still processing, ${currentProcessingSet.size - stillProcessing.size} completed`)
          }

          setProcessingLeads(stillProcessing)
          processingLeadsRef.current = stillProcessing
          
          // Update leads state to trigger re-render
          // CRITICAL: Create new object references for all updated leads to ensure React.memo detects changes
          setLeads((prevLeads) => {
            // Create a map of updated leads for quick lookup
            const updatedMap = new Map(updatedLeads.map(lead => [lead.id, lead]))
            
            // Merge: use updated lead if available, otherwise keep existing
            // IMPORTANT: Create new object references for all leads (even unchanged ones) to ensure React detects changes
            const merged = prevLeads.map(lead => {
              const updated = updatedMap.get(lead.id)
              if (updated) {
                // Create a new object reference with new data reference
                // This ensures React.memo in DataRow will detect the change
                return {
                  ...updated,
                  data: { ...updated.data }, // Create new data object reference
                }
              }
              // Even for unchanged leads, create a new reference to ensure reactivity
              return {
                ...lead,
                data: { ...lead.data },
              }
            })
            
            // Add any new leads that weren't in prevLeads
            updatedLeads.forEach(lead => {
              if (!prevLeads.find(l => l.id === lead.id)) {
                merged.push({
                  ...lead,
                  data: { ...lead.data }, // Create new data object reference
                })
              }
            })
            
            // Force a new array reference to ensure React detects the change
            // This is critical for React to re-render when data changes
            return [...merged]
          })

          if (stillProcessing.size === 0) {
            console.log('✅ All leads completed - stopping polling')
            if (refreshIntervalRef.current) {
              clearInterval(refreshIntervalRef.current)
              refreshIntervalRef.current = null
            }
            setProcessingColumnId(null)
            processingColumnIdRef.current = null
            setProcessingLeads(new Set())
            processingLeadsRef.current = new Set()
            isRunningRef.current = false // Allow future enrichment runs
            const completedColumnName = processingColumnNameRef.current || 'column'
            processingColumnNameRef.current = null
            setToast({ message: `Enrichment completed for "${completedColumnName}"` })
          }
        } else {
          console.error('Failed to fetch leads during polling:', response.status)
        }
      } catch (error) {
        console.error('Error polling for updates:', error)
        // On error, stop polling to avoid infinite loop
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
          refreshIntervalRef.current = null
        }
        setProcessingColumnId(null)
        processingColumnIdRef.current = null
        setProcessingLeads(new Set())
        processingLeadsRef.current = new Set()
        setProcessingProgress(null)
        isRunningRef.current = false
      }
    }, 2000) // Poll every 2 seconds (reduced frequency to avoid overwhelming the server)
    } // Close finally block
  } // Close handleRunAIColumn function



  const handleImportComplete = () => {
    // Import creates a new board, so we don't need to refresh this one
  }

  // Export CSV functionality
  const handleExportCSV = useCallback(async () => {
    try {
      setToast({ message: 'Preparing export...' })
      
      // Fetch all leads for export (not just the current view)
      const headers = getAuthHeaders()
      const response = await fetch(`/api/leads?board_id=${encodeURIComponent(params.id)}&start=0`, { headers })
      if (!response.ok) {
        throw new Error('Failed to fetch leads for export')
      }
      const data = await response.json()
      const exportLeads: Lead[] = data.leads || []
      
      if (exportLeads.length === 0) {
        setToast({ message: 'No data to export', variant: 'destructive' })
        return
      }

      // Get sorted columns (excluding index column)
      const sortedColumns = [...columnConfigs]
        .filter(col => col.id !== '__index')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

      if (sortedColumns.length === 0) {
        setToast({ message: 'No columns to export', variant: 'destructive' })
        return
      }

      // Generate CSV using the helper function
      const csvContent = convertBoardToCSV(
        sortedColumns,
        exportLeads,
        board?.columns as any[] // Pass board columns for UUID lookup
      )

      // Create blob with BOM for Excel compatibility
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const boardName = board?.name || 'board'
      const sanitizedBoardName = boardName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      link.download = `${sanitizedBoardName}-export-${timestamp}.csv`
      
      // Trigger download
      document.body.appendChild(link)
      link.click()
      
      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      setToast({ message: `Exported ${exportLeads.length} rows to CSV` })
    } catch (error) {
      console.error('Error exporting CSV:', error)
      setToast({ 
        message: error instanceof Error ? error.message : 'Failed to export CSV', 
        variant: 'destructive' 
      })
    }
  }, [params.id, columnConfigs, board, setToast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-3">
        <Loader size="md" className="text-primary" />
        <div className="text-muted-foreground text-sm">Loading board...</div>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="text-center space-y-5 max-w-md">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/80 flex items-center justify-center mb-1">
            <Upload className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {board?.name || 'Board'}
          </h1>
          <p className="text-muted-foreground leading-relaxed">No data yet. Import a CSV file to get started.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <Button onClick={() => setIsImportModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Leads
            </Button>
          </div>
        </div>
        <CSVImporter
          open={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
        />
      </div>
    )
  }

  const headerGroups = table.getHeaderGroups()
  // Include ALL columns (including hidden) for drag-and-drop and visibility toggle
  const sortableIds = columnConfigs
    .filter((c) => c.id !== '__index')
    .map((c) => c.id)

  return (
    <div className="flex flex-col h-screen">
      {boardError && (
        <div className="flex items-center gap-3 px-5 py-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
          <span className="flex-1">{boardError}</span>
          <button
            className="px-3 py-1.5 border border-destructive/30 rounded-lg text-destructive hover:bg-destructive/10 text-xs font-medium transition-colors"
            onClick={() => { refetchBoard(); refetchLeads() }}
          >
            Retry
          </button>
        </div>
      )}
      <BoardHeader
        board={board}
        totalRows={totalRows}
        isLoading={isLoading}
        processingProgress={processingProgress}
        onRefresh={refetchLeads}
        onExportCSV={handleExportCSV}
        onAddLeads={() => setIsImportModalOpen(true)}
      />

      {/* Table Container with Virtualization */}
      <div className="flex-1 overflow-auto bg-background" style={{ height: 'calc(100vh - 73px)' }}>
        <div
          ref={setParentRef}
          className="h-full overflow-auto bg-background"
          onScroll={handleTableScrollBump}
        >
          <div className="inline-block min-w-full bg-background relative">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <table
                style={{
                  width: table.getCenterTotalSize(),
                  tableLayout: 'fixed',
                }}
                className="w-full border-separate border-spacing-0 bg-background"
              >
                <TableHeader className="sticky top-0 z-50 bg-background">
                  {headerGroups.map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="h-[38px] bg-background hover:bg-transparent">
                      <SortableContext
                        items={sortableIds}
                        strategy={horizontalListSortingStrategy}
                      >
                        {headerGroup.headers
                          .filter((h) => h.id === '__select')
                          .map((header) => (
                            <TableHead
                              key={header.id}
                              className="border-r border-border/60 border-b border-border/60 bg-muted/40 h-[38px] py-0 px-0 text-center align-middle sticky z-[52]"
                              style={{
                                width: ROW_SELECT_COL_WIDTH,
                                minWidth: ROW_SELECT_COL_WIDTH,
                                maxWidth: ROW_SELECT_COL_WIDTH,
                                left: 0,
                                top: 0,
                                position: 'sticky',
                              }}
                            >
                              <div className="flex items-center justify-center h-[38px] w-full">
                                <SelectAllVisibleHeader
                                  getVisibleLeadIds={getVisibleLeadIds}
                                  selectedLeadIds={selectedLeadIds}
                                  setSelectedLeadIds={setSelectedLeadIds}
                                  viewportVersion={viewportVersion}
                                />
                              </div>
                            </TableHead>
                          ))}
                        {/* Row index column (sticky after checkbox column) */}
                        {headerGroup.headers
                          .filter((h) => h.id === '__index')
                          .map((header) => {
                            return (
                              <ColumnHeader
                                key={header.id}
                                header={header}
                                columnConfig={undefined}
                                onRename={() => {}}
                                onDelete={() => {}}
                                onColorChange={() => {}}
                                isIndexColumn={true}
                                stickyLeftOffset={ROW_SELECT_COL_WIDTH}
                                leads={leads}
                              />
                            )
                          })}
                        {/* Then render all data columns (including hidden ones) */}
                        {columnConfigs
                          .sort((a, b) => a.order - b.order)
                          .map((config) => {
                            const header = headerGroup.headers.find((h) => h.id === config.id)
                            if (!header) return null
                            
                            return (
                              <ColumnHeader
                                key={header.id}
                                header={header}
                                columnConfig={config}
                                onRename={(newHeader) => handleColumnRename(config.id, newHeader)}
                                onDelete={() => handleDeleteColumn(config.id)}
                                onColorChange={handleColumnColorChange}
                                onAIConfig={config.type === 'ai_enrichment' ? () => handleAIConfig(config) : undefined}
                                onDropContactConfig={config.type === 'dropcontact' ? () => handleDropContactConfig(config) : undefined}
                                onRenameClick={() => handleOpenRenameDialog(config)}
                                onResize={handleColumnResize}
                                onResizeEnd={handleColumnResizeEnd}
                                isIndexColumn={false}
                                leads={leads}
                              />
                            )
                          })}
                        
                        {/* Add Column Header */}
                        {!isAddingColumn ? (
                          <TableHead
                            className="border-r border-border/60 border-b border-border/60 font-semibold text-sm text-foreground bg-muted/40 h-full py-0 pl-3 pr-6"
                            style={{
                              width: 150,
                              minWidth: 150,
                              maxWidth: 150,
                            }}
                          >
                            <DropdownMenu
                              trigger={
                                <button
                                  type="button"
                                  className="w-full h-full flex items-center justify-start gap-2 text-sm font-semibold text-foreground hover:bg-accent rounded-lg cursor-pointer transition-colors whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Plus className="h-4 w-4 flex-shrink-0" />
                                  <span className="whitespace-nowrap">Add a Column</span>
                                </button>
                              }
                            >
                              <DropdownMenuItem
                                onClick={() => {
                                  setIsAddingColumn(true)
                                  setTimeout(() => {
                                    newColumnNameInputRef.current?.focus()
                                  }, 0)
                                }}
                              >
                                <Type className="h-4 w-4 mr-2" />
                                Text Column
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCreateAIColumn()}
                              >
                                <Sparkles className="h-4 w-4 mr-2" />
                                AI Enrichment
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCreateDropContactColumn()}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                Find Email (DropContact)
                              </DropdownMenuItem>
                            </DropdownMenu>
                          </TableHead>
                        ) : (
                          <TableHead
                            className="border-r border-border/60 border-b border-border/60 font-semibold text-sm text-foreground bg-muted/40 h-full py-0 pl-3 pr-6"
                            style={{
                              width: 200,
                              minWidth: 200,
                              maxWidth: 200,
                            }}
                          >
                            <Input
                              ref={newColumnNameInputRef}
                              value={newColumnName}
                              onChange={(e) => setNewColumnName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleAddTextColumn(newColumnName)
                                } else if (e.key === 'Escape') {
                                  setIsAddingColumn(false)
                                  setNewColumnName('')
                                }
                              }}
                              onBlur={() => {
                                if (newColumnName.trim()) {
                                  handleAddTextColumn(newColumnName)
                                } else {
                                  setIsAddingColumn(false)
                                  setNewColumnName('')
                                }
                              }}
                              placeholder="Column name..."
                              className="h-8 text-sm font-medium"
                              autoFocus
                            />
                          </TableHead>
                        )}
                      </SortableContext>
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody
                  className="bg-background"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index] as Row<Lead>
                    return (
                      <DataRow
                        key={row.id}
                        row={row}
                        virtualRow={virtualRow}
                        columnConfigs={columnConfigs}
                        columnConfigMap={columnConfigMap}
                        isAddingColumn={isAddingColumn}
                        measureElement={rowVirtualizer.measureElement}
                        processingRecordIds={processingLeads}
                        processingColumnId={processingColumnId}
                        onRowContextMenu={handleRowContextMenu}
                        isRowSelected={selectedLeadIds.has(row.original.id)}
                        onToggleRowSelect={toggleLeadSelection}
                      />
                    )
                  })}
                </TableBody>
              </table>
            </DndContext>
          </div>
        </div>
      </div>

      <CSVImporter
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
      />


      {selectedAIColumn && (
        <AIConfigurationModal
          open={isAIConfigModalOpen}
          onOpenChange={setIsAIConfigModalOpen}
          boardId={params.id}
          columnConfig={selectedAIColumn}
          columnConfigs={columnConfigs}
          onSave={handleSaveAIConfigWrapper}
          onRun={handleRunAIColumn}
          leads={leads}
        />
      )}

      {/* DropContact Mapping Modal */}
      {selectedDropContactColumn && (
        <DropContactMappingModal
          open={isDropContactMappingModalOpen}
          onOpenChange={setIsDropContactMappingModalOpen}
          columnConfig={selectedDropContactColumn}
          columnConfigs={columnConfigs}
          onSave={async (mapping) => {
            if (!selectedDropContactColumn?.columnId) {
              throw new Error('No column selected')
            }
            await handleSaveDropContactMapping(selectedDropContactColumn.columnId, mapping)
            // Update selectedDropContactColumn with new mapping
            if (selectedDropContactColumn) {
              setSelectedDropContactColumn({
                ...selectedDropContactColumn,
                config: {
                  ...selectedDropContactColumn.config,
                  metadata: {
                    ...(selectedDropContactColumn.config as any)?.metadata,
                    mapping,
                  },
                },
              })
            }
          }}
          onRun={async (rowLimit, excludeProcessed) => {
            await handleRunDropContactColumn(rowLimit, excludeProcessed ?? true)
          }}
        />
      )}


      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      <CellDetailPanel
        open={!!selectedCell}
        onOpenChange={(open) => {
          if (!open) setSelectedCell(null)
        }}
        cellData={selectedCell}
      />

      {/* Rename Column Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
            <DialogDescription>
              Enter a new name for this column. This will update the column header and may affect prompt variables.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="rename-input" className="text-sm font-medium">
                Column Name
              </label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveRename()
                  } else if (e.key === 'Escape') {
                    setIsRenameDialogOpen(false)
                    setColumnToRename(null)
                    setRenameValue('')
                  }
                }}
                placeholder="Enter column name..."
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsRenameDialogOpen(false)
                setColumnToRename(null)
                setRenameValue('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRename}
              disabled={!renameValue.trim() || renameValue.trim() === columnToRename?.name}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedLeadIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 flex items-center gap-3 rounded-xl border border-border/80 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm"
          role="toolbar"
          aria-label="Row selection actions"
        >
          <span className="text-sm text-muted-foreground tabular-nums">
            {selectedLeadIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSelectedLeadIds(new Set())}
          >
            <X className="h-4 w-4" />
            Clear selection
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => openDeleteRowsDialog([...selectedLeadIds])}
          >
            <Trash2 className="h-4 w-4" />
            Delete {selectedLeadIds.size} row{selectedLeadIds.size === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      {rowContextMenu && (
        <div
          role="menu"
          className="fixed z-[100] min-w-[10rem] rounded-lg border bg-popover py-1 text-popover-foreground shadow-md"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent"
            onClick={() => {
              openDeleteRowsDialog([rowContextMenu.leadId])
              setRowContextMenu(null)
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete row
          </button>
        </div>
      )}

      <AlertDialog
        open={deleteRowsDialogOpen}
        onOpenChange={(open) => {
          setDeleteRowsDialogOpen(open)
          if (!open) {
            pendingDeleteIdsRef.current = []
            setPendingDeleteIds([])
          }
        }}
        title="Delete rows?"
        description={`Are you sure you want to delete ${pendingDeleteIds.length} row${pendingDeleteIds.length === 1 ? '' : 's'}? This cannot be undone.`}
        onConfirm={confirmBulkDelete}
        confirmText={`Delete ${pendingDeleteIds.length} row${pendingDeleteIds.length === 1 ? '' : 's'}`}
        cancelText="Cancel"
      />
    </div>
  )
}
