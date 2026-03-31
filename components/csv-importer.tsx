'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toast } from '@/components/ui/toast'
import { CSVRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { X, FileSpreadsheet, Upload } from 'lucide-react'

interface CSVImporterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: () => void
}

const CHUNK_SIZE = 200

/** Empty cell: null, undefined, "", or whitespace-only string. */
function isNonEmptyCellValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return String(value).trim() !== ''
}

/** Column "has data" iff at least one row has a non-empty value for that header. */
function computeColumnsWithDataAnywhere(headers: string[], rows: CSVRow[]): Set<string> {
  const withData = new Set<string>()
  const n = headers.length
  for (const row of rows) {
    for (const h of headers) {
      if (withData.has(h)) continue
      if (isNonEmptyCellValue(row[h])) {
        withData.add(h)
      }
    }
    if (withData.size === n) break
  }
  return withData
}

export function CSVImporter({ open, onOpenChange, onImportComplete }: CSVImporterProps) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [columnsWithData, setColumnsWithData] = useState<Set<string>>(() => new Set())
  const [headers, setHeaders] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null)
  const [boardName, setBoardName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processSelectedFile = useCallback((selectedFile: File | undefined | null) => {
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    setBoardName(selectedFile.name.replace(/\.csv$/i, '').trim() || 'Untitled Board')
    setError(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const csvText = event.target?.result as string

        if (!csvText) {
          setError('Failed to read CSV file')
          return
        }

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          encoding: 'UTF-8',
          complete: (results) => {
            if (results.errors.length > 0) {
              setError(`CSV parsing error: ${results.errors[0].message}`)
              return
            }

            const rows = results.data as CSVRow[]
            if (rows.length === 0) {
              setError('CSV file is empty')
              return
            }

            // Papa's meta.fields is the header row left-to-right; Object.keys(row) is not guaranteed to match.
            const csvHeaders =
              results.meta.fields && results.meta.fields.length > 0
                ? [...results.meta.fields]
                : Object.keys(rows[0])
            setHeaders(csvHeaders)
            setColumnsWithData(new Set(computeColumnsWithDataAnywhere(csvHeaders, rows)))
            setSelectedColumns(new Set(csvHeaders))
          },
          error: (error: Error) => {
            setError(`Error parsing CSV: ${error.message}`)
          },
        })
      } catch (err) {
        setError(`Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    reader.onerror = () => {
      setError('Failed to read CSV file')
    }

    reader.readAsText(selectedFile, 'UTF-8')
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processSelectedFile(e.target.files?.[0])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isImporting) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isImporting) return
    const dropped = e.dataTransfer.files?.[0]
    processSelectedFile(dropped)
  }

  const clearFile = () => {
    if (isImporting) return
    setFile(null)
    setBoardName('')
    setColumnsWithData(new Set())
    setHeaders([])
    setSelectedColumns(new Set())
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleImport = async () => {
    if (!file) return

    setIsImporting(true)
    setError(null)
    setProgress(null)

    try {
      // CRITICAL: Read file as UTF-8 text explicitly before parsing
      // This ensures French characters (é, à, ç, etc.) and other special characters are preserved
      // Note: The CSV file must be saved as UTF-8 (e.g., "CSV UTF-8 (Comma delimited)" in Excel)
      const csvText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const text = event.target?.result as string
          if (text) {
            resolve(text)
          } else {
            reject(new Error('Failed to read CSV file as UTF-8 text'))
          }
        }
        reader.onerror = () => {
          reject(new Error('Error reading CSV file'))
        }
        // Explicitly read as UTF-8 text
        reader.readAsText(file, 'UTF-8')
      })

      // Parse CSV text with explicit UTF-8 handling
      const parseResult = await new Promise<Papa.ParseResult<CSVRow>>((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          encoding: 'UTF-8', // Explicitly set UTF-8 encoding for proper character handling (French characters, etc.)
          complete: (results: Papa.ParseResult<CSVRow>) => {
            if (results.errors.length > 0) {
              reject(new Error(`CSV parsing error: ${results.errors[0].message}`))
            } else {
              resolve(results)
            }
          },
          error: (error: Error) => {
            reject(new Error(`Error parsing CSV: ${error.message}`))
          },
        })
      })

      const rows = parseResult.data as CSVRow[]
      
      if (rows.length === 0) {
        throw new Error('CSV file is empty')
      }

      const headerFields =
        parseResult.meta.fields && parseResult.meta.fields.length > 0
          ? [...parseResult.meta.fields]
          : Object.keys(rows[0])

      const resolvedBoardName = boardName.trim() || file.name.replace(/\.csv$/i, '').trim() || 'Untitled Board'

      // Preserve CSV column order in each row object (JSON.stringify follows key insertion order).
      const selectedInCsvOrder = headerFields.filter((field) => selectedColumns.has(field))
      
      // Transform rows: pack ONLY selected columns into data JSONB
      // IMPORTANT: Process ALL rows, no limits
      const transformedRows = rows.map((row) => {
        const cleanedData: Record<string, any> = {}
        for (const key of selectedInCsvOrder) {
          const raw = row[key]
          const value = typeof raw === 'string' ? raw.trim() : raw
          if (value !== undefined && value !== '') {
            cleanedData[key] = value
          }
        }
        return { data: cleanedData }
      })

      // Split into chunks of 500 rows for API requests
      const chunks: typeof transformedRows[] = []
      for (let i = 0; i < transformedRows.length; i += CHUNK_SIZE) {
        chunks.push(transformedRows.slice(i, i + CHUNK_SIZE))
      }

      let boardId: string | null = null
      let totalInserted = 0
      let columnMapping: Record<string, string> = {} // header name -> column UUID

      // Process first chunk: Create board and insert first chunk
      try {
        setProgress({
          current: 1,
          total: chunks.length,
          message: `Creating board and importing rows 1 to ${Math.min(CHUNK_SIZE, transformedRows.length)}...`,
        })

        const createResponse = await fetch('/api/boards/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8', // Explicitly set UTF-8 charset
          },
          body: JSON.stringify({
            boardName: resolvedBoardName,
            firstChunk: chunks[0],
            columnOrder: selectedInCsvOrder,
          }),
        })

        if (!createResponse.ok) {
          const contentType = createResponse.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const errorData = await createResponse.json()
            throw new Error(errorData.message || 'Failed to create board and import first chunk')
          } else {
            const text = await createResponse.text()
            console.error('Non-JSON error response:', text.substring(0, 200))
            throw new Error(`Server error (${createResponse.status}): ${createResponse.statusText}`)
          }
        }

        const contentType = createResponse.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await createResponse.text()
          console.error('Non-JSON success response:', text.substring(0, 200))
          throw new Error('Server returned non-JSON response')
        }

        const createData = await createResponse.json()
        boardId = createData.boardId
        totalInserted += createData.inserted || 0
        
        // Store column mapping for remaining chunks
        columnMapping = createData.columnMapping || {}
      } catch (err) {
        console.error('Error creating board:', err)
        let errorMessage = 'Failed to create board'
        if (err instanceof Error) {
          errorMessage = err.message
        } else if (typeof err === 'string') {
          errorMessage = err
        }
        setError(errorMessage)
        setToast(errorMessage)
        setIsImporting(false)
        setProgress(null)
        return
      }

      // Process remaining chunks — wrapped in a single try/catch so a failure
      // after board creation triggers cleanup of the partial board.
      try {
        for (let i = 1; i < chunks.length; i++) {
          const chunk = chunks[i]
          const startRow = i * CHUNK_SIZE + 1
          const endRow = Math.min((i + 1) * CHUNK_SIZE, transformedRows.length)

          setProgress({
            current: i + 1,
            total: chunks.length,
            message: `Importing rows ${startRow} to ${endRow}...`,
          })

          const insertResponse = await fetch('/api/leads/insert', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              boardId,
              leads: chunk,
              columnMapping,
            }),
          })

          if (!insertResponse.ok) {
            const contentType = insertResponse.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
              const errorData = await insertResponse.json()
              throw new Error(errorData.message || `Failed to import chunk ${i + 1}`)
            } else {
              const text = await insertResponse.text()
              console.error('Non-JSON error response:', text.substring(0, 200))
              throw new Error(`Server error (${insertResponse.status}): ${insertResponse.statusText}`)
            }
          }

          const contentType = insertResponse.headers.get('content-type')
          if (!contentType || !contentType.includes('application/json')) {
            const text = await insertResponse.text()
            console.error('Non-JSON success response:', text.substring(0, 200))
            throw new Error('Server returned non-JSON response')
          }

          const insertData = await insertResponse.json()
          totalInserted += insertData.inserted || 0
        }
      } catch (err) {
        console.error('Error importing chunks:', err)
        // Board was already created — delete it to avoid leaving a partial board in the DB
        if (boardId) {
          try {
            await fetch(`/api/boards/${boardId}`, { method: 'DELETE' })
          } catch (deleteErr) {
            console.error('Error deleting partial board during cleanup:', deleteErr)
          }
        }
        const errorMessage =
          'Import failed partway through. The partial board has been removed. Please try again.'
        setError(errorMessage)
        setToast(errorMessage)
        setIsImporting(false)
        setProgress(null)
        return
      }

      // Success! Redirect to the new board
      if (boardId) {
        // Call import complete callback before redirecting
        if (onImportComplete) {
          onImportComplete()
        }
        
        onOpenChange(false)
        resetForm()
        
        // Small delay to ensure callback completes, then redirect
        setTimeout(() => {
          router.push(`/dashboard/board/${boardId}`)
          router.refresh()
        }, 100)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import leads'
      setError(errorMessage)
      setToast(errorMessage)
    } finally {
      setIsImporting(false)
      setProgress(null)
    }
  }

  const resetForm = () => {
    setFile(null)
    setBoardName('')
    setColumnsWithData(new Set())
    setHeaders([])
    setSelectedColumns(new Set())
    setError(null)
    setProgress(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleColumn = (column: string) => {
    setSelectedColumns((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(column)) {
        newSet.delete(column)
      } else {
        newSet.add(column)
      }
      return newSet
    })
  }

  const selectAllColumns = () => {
    setSelectedColumns(new Set(headers))
  }

  const deselectAllColumns = () => {
    setSelectedColumns(new Set())
  }

  const allSelected = headers.length > 0 && selectedColumns.size === headers.length

  const handleClose = () => {
    if (!isImporting) {
      resetForm()
      onOpenChange(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[92vh] gap-0 overflow-hidden border-border/80 p-0 shadow-xl sm:rounded-2xl">
          <div className="max-h-[92vh] overflow-y-auto">
            <DialogHeader className="space-y-1 border-b border-border/60 px-8 pb-6 pt-8 text-left">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Import from CSV
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                Upload a spreadsheet and choose which columns to bring into a new board. UTF-8 CSVs work best for special characters.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-8 px-8 py-8">
              <input
                id="csv-file"
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={handleFileSelect}
                disabled={isImporting}
              />

              {!file ? (
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    File
                  </Label>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      'group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 transition-all duration-200',
                      'bg-muted/30 hover:bg-muted/45',
                      isDragging
                        ? 'border-primary/60 bg-primary/[0.04] ring-2 ring-primary/20'
                        : 'border-border/80 hover:border-border',
                      isImporting && 'pointer-events-none opacity-50'
                    )}
                  >
                    <div
                      className={cn(
                        'mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60 bg-background shadow-sm transition-transform duration-200',
                        'group-hover:scale-105',
                        isDragging && 'scale-105 border-primary/30'
                      )}
                    >
                      <Upload className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
                    </div>
                    <p className="text-center text-sm font-medium text-foreground">
                      Drop your CSV here or{' '}
                      <span className="text-primary underline-offset-4 group-hover:underline">click to browse</span>
                    </p>
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Comma-separated values · UTF-8 recommended
                    </p>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      File
                    </Label>
                    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={clearFile}
                        disabled={isImporting}
                        aria-label="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="board-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Board name
                    </Label>
                    <Input
                      id="board-name"
                      value={boardName}
                      onChange={(e) => setBoardName(e.target.value)}
                      disabled={isImporting}
                      placeholder="Untitled board"
                      className="h-11 rounded-lg border-border/80 bg-background text-base font-medium shadow-sm transition-shadow focus-visible:ring-offset-0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown on your dashboard. Defaults to the file name without <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.csv</code>.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {progress && (
                <div className="rounded-xl border border-border/60 bg-muted/25 px-5 py-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <span className="text-sm font-medium leading-snug text-foreground">{progress.message}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/80">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {headers.length > 0 && (
                <div className="space-y-8 border-t border-border/50 pt-8">
                  <div>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Columns</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {selectedColumns.size} of {headers.length} selected
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={selectAllColumns}
                          disabled={allSelected}
                          className="h-8 text-xs text-muted-foreground"
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={deselectAllColumns}
                          disabled={selectedColumns.size === 0}
                          className="h-8 text-xs text-muted-foreground"
                        >
                          Deselect all
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {headers.map((header) => {
                        const isSelected = selectedColumns.has(header)
                        const hasData = columnsWithData.has(header)
                        return (
                          <button
                            key={header}
                            type="button"
                            onClick={() => toggleColumn(header)}
                            disabled={isImporting}
                            title={
                              hasData
                                ? 'At least one row has a value in this column'
                                : 'Empty in every row for this column'
                            }
                            className={cn(
                              'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-left text-sm font-medium transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              isSelected
                                ? 'border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                                : cn(
                                    'border border-border bg-background hover:bg-muted/50',
                                    hasData
                                      ? 'text-foreground/90'
                                      : 'text-muted-foreground opacity-75'
                                  )
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                isSelected
                                  ? 'bg-primary-foreground/90'
                                  : hasData
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground/35'
                              )}
                              aria-hidden
                            />
                            <span className="truncate font-mono text-xs sm:text-sm">{header}</span>
                          </button>
                        )
                      })}
                    </div>
                    {selectedColumns.size === 0 && (
                      <p className="mt-2 text-sm text-destructive">Select at least one column to import.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-6 sm:flex-row sm:justify-end sm:gap-3">
                <Button variant="outline" onClick={handleClose} disabled={isImporting} className="rounded-lg sm:min-w-[100px]">
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!file || isImporting || headers.length === 0 || selectedColumns.size === 0}
                  className="rounded-lg sm:min-w-[180px]"
                >
                  {isImporting ? 'Importing…' : 'Import & create board'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {toast && (
        <Toast
          message={toast}
          variant="destructive"
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
