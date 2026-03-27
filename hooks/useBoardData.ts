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
  viewStart: number
  viewLimit: number | null
  setViewStart: (start: number) => void
  setViewLimit: (limit: number | null) => void
  refetchLeads: () => Promise<void>
  refetchBoard: () => Promise<void>
}

/**
 * Custom hook for managing board data fetching and pagination.
 * Handles fetching leads and board data, with localStorage persistence for pagination settings.
 */
export function useBoardData({ boardId }: UseBoardDataProps): UseBoardDataReturn {
  const [leads, setLeads] = useState<Lead[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Initialize with safe defaults — localStorage is read in a useEffect below
  // to avoid SSR/client hydration mismatches.
  const [viewStart, setViewStart] = useState(0)
  const [viewLimit, setViewLimit] = useState<number | null>(100)

  // Initialize from localStorage after first render (avoids SSR mismatch)
  useEffect(() => {
    const savedStart = localStorage.getItem(`rowView_${boardId}_start`)
    const savedLimit = localStorage.getItem(`rowView_${boardId}_limit`)

    if (savedStart) {
      const parsed = Number(savedStart)
      if (!isNaN(parsed) && parsed >= 0) setViewStart(parsed)
    }

    if (savedLimit !== null) {
      if (savedLimit === 'null') {
        setViewLimit(null)
      } else {
        const parsed = Number(savedLimit)
        if (!isNaN(parsed) && parsed > 0 && parsed <= 10000) setViewLimit(parsed)
      }
    }
  }, [boardId])

  // Save row view settings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`rowView_${boardId}_start`, viewStart.toString())
      localStorage.setItem(`rowView_${boardId}_limit`, viewLimit === null ? 'null' : viewLimit.toString())
    }
  }, [boardId, viewStart, viewLimit])

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
          start: viewStart.toString(),
        })
        if (viewLimit !== null) {
          queryParams.append('limit', viewLimit.toString())
        }

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
    [boardId, viewStart, viewLimit]
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
    viewStart,
    viewLimit,
    setViewStart,
    setViewLimit,
    refetchLeads,
    refetchBoard: fetchBoard,
  }
}
