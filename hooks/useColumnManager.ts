'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ColumnConfig, Board } from '@/lib/types'

interface UseColumnManagerProps {
  board: Board | null
  boardId: string
  onBoardUpdate: () => Promise<void>
  onLeadsUpdate: () => Promise<void>
  onToast: (message: string, variant?: 'default' | 'destructive') => void
}

interface UseColumnManagerReturn {
  columnConfigs: ColumnConfig[]
  setColumnConfigs: React.Dispatch<React.SetStateAction<ColumnConfig[]>>
  deletedColumnIds: Set<string>
  isSavingColumns: boolean
  hasInitialized: boolean
  hasPendingChanges: boolean
  setHasInitialized: (value: boolean) => void
  saveColumnConfig: (configs: ColumnConfig[]) => Promise<void>
  saveColumnConfigDebounced: (configs: ColumnConfig[]) => void
  /** Persist drag-reorder for board_columns (single batch API); legacy boards use saveColumnConfig. */
  persistColumnOrder: (orderedConfigs: ColumnConfig[]) => Promise<void>
  handleColumnRename: (columnId: string, newHeader: string) => Promise<void>
  handleDeleteColumn: (columnId: string) => Promise<void>
  handleColumnColorChange: (columnId: string, color: string) => void
  handleCreateAIColumn: () => Promise<void>
  handleSaveAIConfig: (
    columnId: string,
    config: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      model: string
      temperature: number
      useWebSearch: boolean
      thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
    }
  ) => Promise<void>
  handleAddTextColumn: (columnName: string) => Promise<void>
  handleCreateDropContactColumn: () => Promise<void>
  handleSaveDropContactMapping: (
    columnId: string,
    mapping: {
      firstNameColId: string
      lastNameColId: string
      companyColId: string
      websiteColId?: string
    }
  ) => Promise<void>
}

/** Validate that a string looks like a UUID (8-4-4-4-12 hex). */
function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Custom hook for managing column operations (CRUD, configuration, etc.)
 * Handles all column-related state and API calls.
 */
export function useColumnManager({
  board,
  boardId,
  onBoardUpdate,
  onLeadsUpdate,
  onToast,
}: UseColumnManagerProps): UseColumnManagerReturn {
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [isSavingColumns, setIsSavingColumns] = useState(false)
  const [deletedColumnIds, setDeletedColumnIds] = useState<Set<string>>(new Set())
  const [hasInitialized, setHasInitialized] = useState(false)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const debouncedSave = useRef<NodeJS.Timeout>()

  // Track in-flight AbortControllers so we can cancel them on unmount
  const activeControllers = useRef<AbortController[]>([])

  // Cancel all in-flight requests on unmount
  useEffect(() => {
    return () => {
      activeControllers.current.forEach((c) => c.abort())
      if (debouncedSave.current) clearTimeout(debouncedSave.current)
    }
  }, [])

  /** Create a new AbortController and register it for cleanup on unmount. */
  function createController(): AbortController {
    const controller = new AbortController()
    activeControllers.current.push(controller)
    // Remove the controller from the list once its signal fires
    controller.signal.addEventListener('abort', () => {
      activeControllers.current = activeControllers.current.filter((c) => c !== controller)
    })
    return controller
  }

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
    }
  }

  // Save column config to database
  const saveColumnConfig = useCallback(
    async (configs: ColumnConfig[]) => {
      if (!board || isSavingColumns) {
        return
      }

      try {
        setIsSavingColumns(true)
        const headers = getAuthHeaders()

        // Persist per-column width/order/color to the board_columns table.
        const updatePromises = configs.map(async (config) => {
            // Find the column by UUID directly, or by name as fallback (backward compatibility)
            const column = Array.isArray(board.columns)
              ? (board.columns as any[]).find(
                  (col: Record<string, unknown>) =>
                    col['id'] === config.id || col['name'] === config.id
                )
              : null

            if (!column || !column['id']) {
              console.warn(`Column not found for config.id: ${config.id}`, {
                availableColumns: Array.isArray(board.columns)
                  ? (board.columns as any[]).map((col: Record<string, unknown>) => ({
                      id: col['id'],
                      name: col['name'],
                    }))
                  : [],
                configId: config.id,
                configHeader: config.header,
              })
              return Promise.resolve()
            }

            const columnId = column['id'] as string

            // Validate UUID before building the URL
            if (!isValidUUID(columnId)) {
              console.error(`Skipping column update — invalid UUID: ${columnId}`)
              return Promise.resolve()
            }

            // Get existing config to preserve other settings
            const existingConfig =
              typeof column['config'] === 'object' && column['config'] !== null
                ? (column['config'] as Record<string, unknown>)
                : {}

            // Build the updated config object, explicitly handling color removal
            const updatedConfig: Record<string, unknown> = {
              ...existingConfig,
              width: config.width,
            }

            if (config.color) {
              updatedConfig['color'] = config.color
            } else {
              delete updatedConfig['color']
            }

            const controller = createController()

            return fetch(`/api/columns/${encodeURIComponent(columnId)}`, {
              method: 'PATCH',
              headers,
              signal: controller.signal,
              body: JSON.stringify({
                order: config.order,
                position: config.order,
                config: updatedConfig,
              }),
            }).then(async (response) => {
              if (!response.ok) {
                const errorText = await response.text()
                console.error(`Failed to update column ${columnId}:`, errorText)
              }
            })
          })

          const results = await Promise.allSettled(updatePromises)
          results.forEach((result, i) => {
            if (result.status === 'rejected') {
              const reason = result.reason
              if (reason instanceof Error && reason.name === 'AbortError') return
              console.error(`Failed to update column config at index ${i}:`, reason)
            }
          })

          await onBoardUpdate()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error saving column config:', error)
        throw error
      } finally {
        setIsSavingColumns(false)
        setHasPendingChanges(false)
      }
    },
    [board, isSavingColumns, onBoardUpdate]
  )

  const persistColumnOrder = useCallback(
    async (orderedConfigs: ColumnConfig[]) => {
      if (!board) return

      const orderedColumnIds = orderedConfigs.map((c) => c.id).filter(isValidUUID)
      if (orderedColumnIds.length === 0) return

      try {
        const headers = getAuthHeaders()
        const controller = createController()
        const response = await fetch(
          `/api/boards/${encodeURIComponent(boardId)}/columns/reorder`,
          {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify({ orderedColumnIds }),
          }
        )

        if (!response.ok) {
          const errText = await response.text()
          console.error('persistColumnOrder failed:', response.status, errText)
          onToast('Failed to save column order', 'destructive')
          return
        }

        await onBoardUpdate()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('persistColumnOrder error:', error)
        onToast('Failed to save column order', 'destructive')
      }
    },
    [board, boardId, onBoardUpdate, onToast, saveColumnConfig]
  )

  // Debounced save function
  const saveColumnConfigDebounced = useCallback(
    (configs: ColumnConfig[]) => {
      if (debouncedSave.current) {
        clearTimeout(debouncedSave.current)
      }
      setHasPendingChanges(true)
      debouncedSave.current = setTimeout(() => {
        saveColumnConfig(configs).catch((error) => {
          if (error instanceof Error && error.name === 'AbortError') return
          console.error('Debounced save failed:', error)
        })
      }, 500)
    },
    [saveColumnConfig]
  )

  // Handle column rename
  const handleColumnRename = useCallback(
    async (columnId: string, newHeader: string) => {
      if (!board) {
        onToast('Board not loaded', 'destructive')
        return
      }

      // Validate the new name before hitting the API
      const trimmedHeader = newHeader.trim()
      if (!trimmedHeader) {
        onToast('Column name cannot be empty', 'destructive')
        return
      }

      try {
        const headers = getAuthHeaders()

        // Find the column by UUID
        const column = Array.isArray(board.columns)
            ? (board.columns as any[]).find(
                (col: Record<string, unknown>) => col['id'] === columnId
              )
            : null

          if (!column || !column['id']) {
            console.error('Column not found for UUID:', columnId, {
              availableColumns: Array.isArray(board.columns)
                ? (board.columns as any[]).map((col: Record<string, unknown>) => ({
                    id: col['id'],
                    name: col['name'],
                  }))
                : [],
            })
            onToast('Column not found', 'destructive')
            return
          }

          const colId = column['id'] as string

          if (!isValidUUID(colId)) {
            console.error(`Invalid column UUID for rename: ${colId}`)
            onToast('Failed to rename column', 'destructive')
            return
          }

          const controller = createController()

          const response = await fetch(`/api/columns/${encodeURIComponent(colId)}`, {
            method: 'PATCH',
            headers,
            signal: controller.signal,
            body: JSON.stringify({ name: trimmedHeader }),
          })

          if (!response.ok) {
            console.error(`Failed to rename column (HTTP ${response.status})`)
            throw new Error('Failed to rename column')
          }

        await onBoardUpdate()

        // Optimistically update local state
        const updatedConfigs = columnConfigs.map((config) => {
          if (config.id === columnId) {
            return { ...config, header: trimmedHeader }
          }
          return config
        })
        setColumnConfigs(updatedConfigs)

        onToast('Column renamed successfully')
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error renaming column:', error)
        onToast('Failed to rename column', 'destructive')
      }
    },
    [board, columnConfigs, onBoardUpdate, onToast]
  )

  // Handle deleting a column
  const handleDeleteColumn = useCallback(
    async (columnId: string) => {
      if (!board) {
        console.error('Cannot delete column: board not loaded')
        return
      }

      try {
        const headers = getAuthHeaders()
        const controller = createController()

        const deleteResponse = await fetch(
          `/api/columns/${encodeURIComponent(columnId)}?board_id=${encodeURIComponent(board.id)}`,
          {
            method: 'DELETE',
            headers,
            signal: controller.signal,
          }
        )

        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text()
          console.error('Failed to delete column:', errorText)
          throw new Error('Failed to delete column')
        }

        setDeletedColumnIds((prev) => new Set([...prev, columnId]))

        const updatedConfigs = columnConfigs.filter((config) => config.id !== columnId)

        const reorderedConfigs = updatedConfigs.map((config, index) => ({
          ...config,
          order: index,
        }))

        setColumnConfigs(reorderedConfigs)

        await saveColumnConfig(reorderedConfigs)
        await onBoardUpdate()
        await onLeadsUpdate()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error deleting column:', error)
        onToast('Failed to delete column', 'destructive')
      }
    },
    [board, columnConfigs, saveColumnConfig, onBoardUpdate, onLeadsUpdate, onToast]
  )

  // Handle column color change
  const handleColumnColorChange = useCallback(
    (columnId: string, color: string) => {
      const previousConfigs = columnConfigs
      const updatedConfigs = columnConfigs.map((config) =>
        config.id === columnId ? { ...config, color: color || undefined } : config
      )
      setColumnConfigs(updatedConfigs)
      saveColumnConfig(updatedConfigs).catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setColumnConfigs(previousConfigs)
        onToast('Failed to save color change', 'destructive')
      })
    },
    [columnConfigs, saveColumnConfig, onToast]
  )

  // Handle creating a new AI enrichment column
  const handleCreateAIColumn = useCallback(async () => {
    if (!board) {
      onToast('Board not loaded', 'destructive')
      return
    }

    const defaultName = `AI Column ${columnConfigs.filter((c) => c.type === 'ai_enrichment').length + 1}`

    try {
      const headers = getAuthHeaders()
      const controller = createController()

      const response = await fetch('/api/columns/create', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          boardId: boardId,
          name: defaultName,
          type: 'ai_enrichment',
          config: {
            prompt: '',
            model: 'gemini-3-flash-preview',
            systemInstruction: 'You are a helpful B2B data assistant. Output only the requested data.',
            temperature: 0.0,
            useWebSearch: false,
          },
        }),
      })

      if (!response.ok) {
        console.error(`Failed to create AI column (HTTP ${response.status})`)
        throw new Error('Failed to create AI column')
      }

      await onBoardUpdate()
      onToast(`AI column "${defaultName}" created. Click the sparkle icon to configure and run.`)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error creating AI column:', error)
      onToast('Failed to create AI column', 'destructive')
    }
  }, [board, boardId, columnConfigs, onBoardUpdate, onToast])

  // Save AI column configuration
  const handleSaveAIConfig = useCallback(
    async (
      columnId: string,
      config: {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
        model: string
        temperature: number
        useWebSearch: boolean
        systemInstruction?: string
        thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
      }
    ) => {
      if (!isValidUUID(columnId)) {
        console.error(`Invalid column UUID for AI config save: ${columnId}`)
        onToast('Failed to save configuration', 'destructive')
        return
      }

      try {
        const headers = getAuthHeaders()
        const fetchController = createController()

        const currentColumnResponse = await fetch(
          `/api/columns/${encodeURIComponent(columnId)}`,
          { headers, signal: fetchController.signal }
        )
        if (!currentColumnResponse.ok) {
          throw new Error('Failed to fetch current column configuration')
        }
        const { column: currentColumn } = await currentColumnResponse.json()
        const existingConfig =
          typeof currentColumn.config === 'object' && currentColumn.config !== null
            ? (currentColumn.config as Record<string, unknown>)
            : {}

        const updatedConfig: Record<string, unknown> = {
          ...existingConfig,
          messages: config.messages,
          model: config.model,
          temperature: config.temperature,
          useWebSearch: config.useWebSearch,
          ...(config.systemInstruction !== undefined && {
            systemInstruction: config.systemInstruction,
          }),
          ...(config.thinkingLevel !== undefined && {
            thinkingLevel: config.thinkingLevel,
          }),
        }

        const patchController = createController()

        const response = await fetch(`/api/columns/${encodeURIComponent(columnId)}`, {
          method: 'PATCH',
          headers,
          signal: patchController.signal,
          body: JSON.stringify({ config: updatedConfig }),
        })

        const responseData = await response.json()

        if (!response.ok) {
          console.error('Failed to save AI config:', responseData)
          throw new Error('Failed to save configuration')
        }

        // Small delay to ensure database write is committed before refreshing
        await new Promise((resolve) => setTimeout(resolve, 100))

        await onBoardUpdate()

        onToast('Configuration saved successfully')
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('Failed to save AI config:', err)
        onToast('Failed to save AI configuration', 'destructive')
      }
    },
    [onBoardUpdate, onToast]
  )

  // Handle creating a new text column
  const handleAddTextColumn = useCallback(
    async (columnName: string) => {
      if (!board) {
        return
      }

      const trimmedName = columnName.trim()
      if (!trimmedName) {
        onToast('Column name cannot be empty', 'destructive')
        return
      }

      try {
        const headers = getAuthHeaders()
        const controller = createController()

        const response = await fetch('/api/columns/create', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            boardId: boardId,
            name: trimmedName,
            type: 'text',
            config: {},
          }),
        })

        if (!response.ok) {
          console.error(`Failed to create text column (HTTP ${response.status})`)
          throw new Error('Failed to create column')
        }

        await onBoardUpdate()
        onToast(`Column "${trimmedName}" created successfully`)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error creating text column:', error)
        onToast('Failed to create column', 'destructive')
      }
    },
    [board, boardId, onBoardUpdate, onToast]
  )

  // Handle creating a new DropContact column
  const handleCreateDropContactColumn = useCallback(async () => {
    if (!board) {
      onToast('Board not loaded', 'destructive')
      return
    }

    const defaultName = `Find Email ${columnConfigs.filter((c) => c.type === 'dropcontact').length + 1}`

    try {
      const headers = getAuthHeaders()
      const controller = createController()

      const response = await fetch('/api/columns/create', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          boardId: boardId,
          name: defaultName,
          type: 'dropcontact',
          config: {
            metadata: {
              mapping: {},
            },
          },
        }),
      })

      if (!response.ok) {
        console.error(`Failed to create DropContact column (HTTP ${response.status})`)
        throw new Error('Failed to create DropContact column')
      }

      await onBoardUpdate()
      onToast(
        `DropContact column "${defaultName}" created. Click the email icon to configure mapping.`
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error creating DropContact column:', error)
      onToast('Failed to create DropContact column', 'destructive')
    }
  }, [board, boardId, columnConfigs, onBoardUpdate, onToast])

  // Handle saving DropContact column mapping
  const handleSaveDropContactMapping = useCallback(
    async (
      columnId: string,
      mapping: {
        firstNameColId: string
        lastNameColId: string
        companyColId: string
        websiteColId?: string
      }
    ) => {
      if (!isValidUUID(columnId)) {
        console.error(`Invalid column UUID for DropContact mapping: ${columnId}`)
        onToast('Failed to save mapping', 'destructive')
        return
      }

      try {
        const headers = getAuthHeaders()
        const fetchController = createController()

        const currentColumnResponse = await fetch(
          `/api/columns/${encodeURIComponent(columnId)}`,
          { headers, signal: fetchController.signal }
        )
        if (!currentColumnResponse.ok) {
          throw new Error('Failed to fetch current column configuration')
        }
        const { column: currentColumn } = await currentColumnResponse.json()
        const existingConfig =
          typeof currentColumn.config === 'object' && currentColumn.config !== null
            ? (currentColumn.config as Record<string, unknown>)
            : {}
        const existingMetadata =
          typeof existingConfig['metadata'] === 'object' && existingConfig['metadata'] !== null
            ? (existingConfig['metadata'] as Record<string, unknown>)
            : {}

        const updatedMetadata = {
          ...existingMetadata,
          mapping,
        }

        const patchController = createController()

        const response = await fetch(`/api/columns/${encodeURIComponent(columnId)}`, {
          method: 'PATCH',
          headers,
          signal: patchController.signal,
          body: JSON.stringify({
            config: {
              ...existingConfig,
              metadata: updatedMetadata,
            },
          }),
        })

        if (!response.ok) {
          console.error(`Failed to save DropContact mapping (HTTP ${response.status})`)
          throw new Error('Failed to save mapping')
        }

        await onBoardUpdate()

        onToast('Column mapping saved successfully')
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error saving DropContact mapping:', error)
        throw error
      }
    },
    [onBoardUpdate, onToast]
  )

  return {
    columnConfigs,
    setColumnConfigs,
    deletedColumnIds,
    isSavingColumns,
    hasInitialized,
    hasPendingChanges,
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
  }
}
