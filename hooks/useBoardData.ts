'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Lead, Board } from '@/lib/types'

interface UseBoardDataProps {
  boardId: string
}

interface UseBoardDataReturn {
  leads: Lead[]
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>
  board: Board | null
  isLoading: boolean
  error: string | null
  totalRows: number
  setTotalRows: React.Dispatch<React.SetStateAction<number>>
  refetchLeads: () => Promise<void>
  refetchBoard: () => Promise<void>
}

/**
 * Custom hook for managing board data fetching.
 * Loads the full lead set for the board (GET /api/leads with no limit).
 */
export function useBoardData({ boardId }: UseBoardDataProps): UseBoardDataReturn {
  const [leads, setLeads] = useState<Lead[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
    }
  }

  const fetchBoard = useCallback(async (signal?: AbortSignal) => {
    try {
      const headers = getAuthHeaders()
      const response = await fetch(`/api/boards/${boardId}`, {
        cache: 'no-store',
        headers,
        signal,
      })
      if (!response.ok) throw new Error('Failed to fetch board')
      const data = await response.json()
      setBoard(data.board)
      setError(null)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('Error fetching board:', err)
      setError(err instanceof Error ? err.message : 'Failed to load board data')
    }
  }, [boardId])

  const fetchLeads = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true)
        const queryParams = new URLSearchParams({
          board_id: boardId,
          start: '0',
        })

        const headers = getAuthHeaders()
        const response = await fetch(`/api/leads?${queryParams.toString()}`, {
          signal,
          headers,
        })
        if (!response.ok) throw new Error('Failed to fetch leads')
        const data = await response.json()
        setLeads(data.leads || [])
        setTotalRows(data.total || 0)
        setError(null)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error('Error fetching leads:', err)
        // Keep stale leads and totalRows visible — only update the error state
        setError(err instanceof Error ? err.message : 'Failed to load leads')
      } finally {
        setIsLoading(false)
      }
    },
    [boardId]
  )

  // Expose a stable refetchLeads that callers can await without needing a signal
  const refetchLeads = useCallback(async () => {
    await fetchLeads()
  }, [fetchLeads])

  useEffect(() => {
    const controller = new AbortController()

    fetchBoard(controller.signal)
    fetchLeads(controller.signal)

    return () => {
      controller.abort()
    }
  }, [fetchBoard, fetchLeads])

  return {
    leads,
    setLeads,
    board,
    isLoading,
    error,
    totalRows,
    setTotalRows,
    refetchLeads,
    refetchBoard: fetchBoard,
  }
}
