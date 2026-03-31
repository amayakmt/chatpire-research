'use client'

import React, { memo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Download } from 'lucide-react'
import { Board } from '@/lib/types'

interface BoardHeaderProps {
  board: Board | null
  totalRows: number
  isLoading: boolean
  processingProgress?: { current: number; total: number } | null
  onRefresh?: () => void
  onExportCSV: () => void
  onAddLeads: () => void
}

/**
 * Board header component containing title, row count, and action buttons.
 */
function BoardHeader({
  board,
  totalRows,
  isLoading,
  processingProgress,
  onExportCSV,
  onAddLeads,
}: BoardHeaderProps) {
  // Guard against division by zero which produces NaN%
  const progressPercentage = processingProgress
    ? Math.round((processingProgress.current / Math.max(1, processingProgress.total)) * 100)
    : 0

  const displayName = board?.name || 'Untitled Board'

  return (
    <div className="border-b border-border/60 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-border/60" />
            <div className="flex flex-row items-baseline gap-3">
              <h1 className="text-lg font-semibold tracking-tight">
                {displayName}
              </h1>
              <span className="text-sm text-muted-foreground tabular-nums">
                {isLoading ? '…' : `${totalRows} row${totalRows === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button size="sm" onClick={onAddLeads} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Leads
            </Button>
          </div>
        </div>
      </div>
      {/* Progress Bar */}
      {processingProgress && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="text-xs font-medium">Batching... ({processingProgress.current} / {processingProgress.total} rows)</span>
            <div
              className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Enrichment progress"
            >
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums">{progressPercentage}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(BoardHeader)
export { BoardHeader }
