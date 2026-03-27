'use client'

import React, { useState, useEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { RefreshCw } from 'lucide-react'

interface RowViewControllerProps {
  viewStart: number
  viewLimit: number | null
  totalRows: number
  isLoading: boolean
  onViewChange: (start: number, limit: number | null) => void
}

/**
 * Row view controller component for managing pagination settings.
 */
function RowViewController({
  viewStart,
  viewLimit,
  totalRows,
  isLoading,
  onViewChange,
}: RowViewControllerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localStart, setLocalStart] = useState(viewStart.toString())
  const [localLimit, setLocalLimit] = useState(viewLimit?.toString() || '')

  useEffect(() => {
    setLocalStart(viewStart.toString())
    setLocalLimit(viewLimit?.toString() || '')
  }, [viewStart, viewLimit])

  const handleSave = () => {
    const parsedStart = parseInt(localStart, 10)
    // Ignore save if start is not a valid number
    if (localStart.trim() !== '' && isNaN(parsedStart)) return
    const start = isNaN(parsedStart) ? 0 : parsedStart

    const parsedLimit = localLimit.trim() === '' ? null : parseInt(localLimit, 10)
    // Ignore save if limit string is non-empty but parses to NaN
    if (localLimit.trim() !== '' && parsedLimit !== null && isNaN(parsedLimit)) return
    const limit = parsedLimit !== null && parsedLimit > 0 ? parsedLimit : null

    onViewChange(Math.max(0, start), limit)
    setIsOpen(false)
  }

  const handleShowAll = () => {
    onViewChange(0, null)
    setIsOpen(false)
  }

  const displayedCount = viewLimit ? Math.min(viewLimit, totalRows) : totalRows
  const showingText = `${displayedCount}/${totalRows} rows`

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-sm text-gray-500 font-normal hover:text-gray-700 transition-colors flex items-center gap-1"
          onClick={() => setIsOpen(true)}
        >
          {isLoading ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : null}
          <span>{showingText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-3">Row View Settings</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="row-view-start" className="text-xs font-medium text-muted-foreground mb-1 block">
                Starting Row
              </label>
              <Input
                id="row-view-start"
                type="number"
                min="0"
                max={totalRows}
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="h-8"
              />
            </div>
            <div>
              <label htmlFor="row-view-limit" className="text-xs font-medium text-muted-foreground mb-1 block">
                Row Limit
              </label>
              <Input
                id="row-view-limit"
                type="number"
                min="1"
                max={totalRows}
                placeholder="Leave empty to show all"
                value={localLimit}
                onChange={(e) => setLocalLimit(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowAll}
              className="text-xs"
            >
              Show All Rows
            </Button>
            <Button size="sm" onClick={handleSave} className="text-xs">
              Save Changes
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default memo(RowViewController)
export { RowViewController }
