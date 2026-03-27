'use client'

import React, { memo } from 'react'
import { Row, flexRender } from '@tanstack/react-table'
import { VirtualItem } from '@tanstack/react-virtual'
import { TableRow, TableCell } from '@/components/ui/table'
import { Lead, ColumnConfig } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface DataRowProps {
  row: Row<Lead>
  virtualRow: VirtualItem
  columnConfigs: ColumnConfig[]
  columnConfigMap: Map<string, ColumnConfig>
  isAddingColumn: boolean
  measureElement: (element: Element | null) => void
  processingRecordIds?: Set<string>
  processingColumnId?: string | null
}

/**
 * Memoized table row component for rendering data rows in the virtualized table.
 * This component handles the rendering of individual table rows with proper virtualization support.
 */
export const DataRow = memo(function DataRow({
  row,
  virtualRow,
  columnConfigs,
  columnConfigMap,
  isAddingColumn,
  measureElement,
  processingRecordIds = new Set(),
  processingColumnId = null,
}: DataRowProps) {
  const leadId = row.original.id
  const isRowProcessing = processingRecordIds.has(leadId)

  return (
    <TableRow
      key={row.id}
      data-index={virtualRow.index}
      ref={measureElement}
      aria-busy={isRowProcessing}
      className="h-[38px] bg-background hover:bg-muted/30"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {/* Render row index cell */}
      {row.getVisibleCells()
        .filter((cell) => cell.column.id === '__index')
        .map((cell) => {
          const columnWidth = cell.column.getSize()
          return (
            <TableCell
              key={cell.id}
              style={{
                width: columnWidth,
                minWidth: columnWidth,
                maxWidth: columnWidth,
                position: 'sticky',
                left: 0,
                zIndex: 10,
                padding: '0 12px',
              }}
              className="border-r border-border/60 border-b border-border/60 text-xs whitespace-nowrap overflow-hidden text-ellipsis sticky left-0 bg-background h-[38px] py-0 text-center text-muted-foreground"
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          )
        })}
      
      {/* Render data cells */}
      {row.getVisibleCells()
        .filter((cell) => {
          if (cell.column.id === '__index') return false
          // Only render cells for columns that exist in config
          return columnConfigMap.has(cell.column.id)
        })
        .map((cell) => {
          // Use TanStack Table's internal fast-updating columnSizing state for width.
          // During drag this reflects the live columnSizing without a full columnConfigs update.
          const columnWidth = cell.column.getSize()
          
          // Check if this cell should show loading indicator
          const normalizedColumnId = cell.column.id.toLowerCase().replace(/\s+/g, '_')
          const isProcessingCell = isRowProcessing && 
            processingColumnId && 
            (processingColumnId === cell.column.id || processingColumnId === normalizedColumnId)
          
          return (
            <TableCell
              key={cell.id}
              style={{
                width: columnWidth,
                minWidth: columnWidth,
                maxWidth: columnWidth,
                padding: '0 12px',
              }}
              className="border-r border-border/60 border-b border-border/60 text-sm whitespace-nowrap overflow-hidden text-ellipsis bg-background h-[38px] py-0"
            >
              {isProcessingCell ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
                </div>
              ) : (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
            </TableCell>
          )
        })}
      
      {/* Add Column empty cell */}
      <TableCell
        className="border-r border-border/60 border-b border-border/60 bg-background h-[38px] py-0"
        style={{
          width: isAddingColumn ? 200 : 150,
          minWidth: isAddingColumn ? 200 : 150,
          maxWidth: isAddingColumn ? 200 : 150,
          padding: '0 12px',
        }}
      />
    </TableRow>
  )
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Re-render if virtualization position changed, or if row/column configs changed
  // Note: We allow re-renders when row data changes (row.original) as that's expected
  const virtualizationChanged =
    prevProps.virtualRow.index !== nextProps.virtualRow.index ||
    prevProps.virtualRow.start !== nextProps.virtualRow.start ||
    prevProps.virtualRow.size !== nextProps.virtualRow.size

  const rowChanged = prevProps.row.id !== nextProps.row.id

  // Reference equality check for columnConfigs.
  // During drag only columnSizing changes (not columnConfigs), so this stays the same
  // reference and the row skips re-rendering. When the user releases, columnConfigs is
  // updated once with the final widths and this triggers a single re-render.
  const columnConfigsChanged = prevProps.columnConfigs !== nextProps.columnConfigs

  const columnConfigMapChanged = prevProps.columnConfigMap !== nextProps.columnConfigMap

  const addingColumnChanged = prevProps.isAddingColumn !== nextProps.isAddingColumn

  // Check if processing state changed (for loading indicators)
  const prevIsProcessing = prevProps.processingRecordIds?.has(prevProps.row.original.id) || false
  const nextIsProcessing = nextProps.processingRecordIds?.has(nextProps.row.original.id) || false
  const processingChanged = prevIsProcessing !== nextIsProcessing || 
                            prevProps.processingColumnId !== nextProps.processingColumnId

  // Check if row data reference changed (indicates data update from polling)
  const rowDataChanged = prevProps.row.original !== nextProps.row.original ||
                         prevProps.row.original.data !== nextProps.row.original.data

  // Only skip re-render if nothing relevant changed
  return !virtualizationChanged && !rowChanged && !columnConfigsChanged && !columnConfigMapChanged && !addingColumnChanged && !processingChanged && !rowDataChanged
})
