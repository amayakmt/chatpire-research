'use client'

import { useState, useRef } from 'react'
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
import { X, FileSpreadsheet } from 'lucide-react'

interface CSVImporterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportComplete?: () => void
}

const CHUNK_SIZE = 200

export function CSVImporter({ open, onOpenChange, onImportComplete }: CSVImporterProps) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CSVRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    setError(null)

    // CRITICAL: Read file as UTF-8 text explicitly to preserve special characters
    // This ensures French accents (é, à, ç, etc.) are correctly decoded
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        // FileReader.readAsText() with UTF-8 encoding ensures proper character decoding
        const csvText = event.target?.result as string
        
        if (!csvText) {
          setError('Failed to read CSV file')
          return
        }

        // Parse CSV text with explicit UTF-8 handling
        // Note: Ensure your CSV file is saved as UTF-8 (e.g., "CSV UTF-8 (Comma delimited)" in Excel)
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          encoding: 'UTF-8', // Explicitly set UTF-8 encoding for proper character handling
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

            const csvHeaders = Object.keys(rows[0])
            setHeaders(csvHeaders)
            setPreview(rows.slice(0, 5)) // Show first 5 rows as preview
            // Select all columns by default
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
    
    // Read file as UTF-8 text (explicit encoding)
    reader.readAsText(selectedFile, 'UTF-8')
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

      // Generate board name from filename (remove .csv extension)
      const boardName = file.name.replace(/\.csv$/i, '').trim() || 'Untitled Board'
      
      // Transform rows: pack ONLY selected columns into data JSONB
      // IMPORTANT: Process ALL rows, no limits
      const transformedRows = rows.map((row) => {
        // Clean up the row data - only include selected columns
        const cleanedData: Record<string, any> = {}
        selectedColumns.forEach((key) => {
          const value = row[key]?.trim()
          if (value !== undefined && value !== '') {
            cleanedData[key] = value
          }
        })
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
            boardName,
            firstChunk: chunks[0],
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
    setPreview([])
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

  const visibleHeaders = headers.filter((h) => selectedColumns.has(h))
  const allSelected = headers.length > 0 && selectedColumns.size === headers.length
  const someSelected = selectedColumns.size > 0 && selectedColumns.size < headers.length

  const handleClose = () => {
    if (!isImporting) {
      resetForm()
      onOpenChange(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import CSV File</DialogTitle>
            <DialogDescription>
              Upload a CSV file and select which columns to import. Only selected columns will be stored in the board.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  disabled={isImporting}
                />
                {file && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (!isImporting) {
                        setFile(null)
                        setPreview([])
                        setHeaders([])
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }
                    }}
                    disabled={isImporting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <FileSpreadsheet className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-foreground">{file.name}</span>{' '}
                    <span>({(file.size / 1024).toFixed(2)} KB)</span>
                    <br />
                    <span className="text-xs">
                      Board name: <span className="font-medium">{file.name.replace(/\.csv$/i, '').trim() || 'Untitled Board'}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20">
                {error}
              </div>
            )}

            {progress && (
              <div className="p-4 bg-muted/50 rounded-lg border border-border/60">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm font-medium">{progress.message}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {progress.current} / {progress.total} chunks
                  </span>
                </div>
                <div className="w-full bg-background rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {headers.length > 0 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium">
                      Select Columns to Import ({selectedColumns.size} of {headers.length} selected)
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={selectAllColumns}
                        disabled={allSelected}
                        className="h-7 text-xs"
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={deselectAllColumns}
                        disabled={selectedColumns.size === 0}
                        className="h-7 text-xs"
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="border border-border/60 rounded-xl p-4 max-h-48 overflow-y-auto bg-muted/20">
                    <div className="space-y-1">
                      {headers.map((header) => {
                        const isSelected = selectedColumns.has(header)
                        return (
                          <label
                            key={header}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleColumn(header)}
                              className="w-4 h-4 rounded border-border accent-primary"
                            />
                            <span className="text-sm font-mono flex-1">{header}</span>
                            {preview.length > 0 && (
                              <span className={`text-xs px-2 py-0.5 rounded-md ${preview[0][header] ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                                {preview[0][header] ? 'Has data' : 'Empty'}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  {selectedColumns.size === 0 && (
                    <p className="text-sm text-destructive mt-2">
                      Please select at least one column to import.
                    </p>
                  )}
                </div>

                {preview.length > 0 && visibleHeaders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Preview (first 5 rows - showing selected columns only)
                    </h3>
                    <div className="border border-border/60 rounded-xl overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            {visibleHeaders.map((header) => (
                              <th key={header} className="px-3 py-2 text-left border-r border-border/40 font-medium text-muted-foreground">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, idx) => (
                            <tr key={idx} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                              {visibleHeaders.map((header) => (
                                <td key={header} className="px-3 py-2 border-r border-border/40 font-mono text-sm">
                                  {row[header] || <span className="text-muted-foreground">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!file || isImporting || preview.length === 0 || selectedColumns.size === 0}
              >
                {isImporting ? 'Importing...' : 'Import & Create Board'}
              </Button>
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
