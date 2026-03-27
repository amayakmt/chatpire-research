'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ColumnConfig } from '@/lib/types'
import { Mail, Play } from 'lucide-react'
import { isDemoMode, DEMO_MAX_ROWS } from '@/lib/demoMode'

interface DropContactMappingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columnConfig: ColumnConfig | null
  columnConfigs: ColumnConfig[]
  onSave: (mapping: {
    firstNameColId: string
    lastNameColId: string
    companyColId: string
    websiteColId?: string
  }) => Promise<void>
  onRun?: (rowLimit: number | 'all', excludeProcessed?: boolean) => Promise<void>
}

export function DropContactMappingModal({
  open,
  onOpenChange,
  columnConfig,
  columnConfigs,
  onSave,
  onRun,
}: DropContactMappingModalProps) {
  // Get saved mapping from column config.metadata
  const savedMapping = (columnConfig as any)?.config?.metadata?.mapping || {}
  
  const [firstNameColId, setFirstNameColId] = useState(savedMapping.firstNameColId || '')
  const [lastNameColId, setLastNameColId] = useState(savedMapping.lastNameColId || '')
  const [companyColId, setCompanyColId] = useState(savedMapping.companyColId || '')
  const [websiteColId, setWebsiteColId] = useState(savedMapping.websiteColId || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [rowLimit, setRowLimit] = useState<number | 'all'>(isDemoMode() ? DEMO_MAX_ROWS : 1)
  const [excludeProcessed, setExcludeProcessed] = useState<boolean>(true)

  // Reset form when modal opens/closes or column changes
  useEffect(() => {
    if (open && columnConfig) {
      const mapping = (columnConfig as any)?.config?.metadata?.mapping || {}
      setFirstNameColId(mapping.firstNameColId || '')
      setLastNameColId(mapping.lastNameColId || '')
      setCompanyColId(mapping.companyColId || '')
      setWebsiteColId(mapping.websiteColId || '')
      if (isDemoMode()) setRowLimit(DEMO_MAX_ROWS)
    }
  }, [open, columnConfig])

  // Filter columns: Allow text and AI enrichment columns (they contain text data)
  // Only exclude the current DropContact column itself and system columns
  const availableColumns = columnConfigs.filter(
    (col) => {
      // Allow text columns and AI enrichment columns (they contain text data)
      const isTextColumn = col.type === 'text' || col.type === 'ai_enrichment'
      // Exclude the current DropContact column itself
      const isNotSelf = col.id !== columnConfig?.id
      return isTextColumn && isNotSelf
    }
  )

  const handleSave = async () => {
    if (!firstNameColId || !lastNameColId || !companyColId) {
      alert('First Name, Last Name, and Company are required')
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        firstNameColId,
        lastNameColId,
        companyColId,
        websiteColId: websiteColId || undefined,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving mapping:', error)
      alert(error instanceof Error ? error.message : 'Failed to save mapping')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRun = async () => {
    if (!firstNameColId || !lastNameColId || !companyColId) {
      alert('First Name, Last Name, and Company are required')
      return
    }

    setIsRunning(true)
    try {
      // Save mapping first if not already saved
      await handleSave()
      // Then run with the selected options
      if (onRun) {
        await onRun(isDemoMode() ? DEMO_MAX_ROWS : rowLimit, excludeProcessed)
        onOpenChange(false) // Close modal after starting run
      }
    } catch (error) {
      console.error('Error running DropContact:', error)
      alert(error instanceof Error ? error.message : 'Failed to run DropContact enrichment')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            DropContact Column Mapping
          </DialogTitle>
          <DialogDescription>
            Map your existing columns to DropContact fields. These will be used to find email addresses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* First Name Mapping */}
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name Source *</Label>
            <Select
              id="firstName"
              value={firstNameColId}
              onChange={(e) => setFirstNameColId(e.target.value)}
            >
              <option value="">Select a column...</option>
              {availableColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.header || col.id}
                </option>
              ))}
            </Select>
          </div>

          {/* Last Name Mapping */}
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name Source *</Label>
            <Select
              id="lastName"
              value={lastNameColId}
              onChange={(e) => setLastNameColId(e.target.value)}
            >
              <option value="">Select a column...</option>
              {availableColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.header || col.id}
                </option>
              ))}
            </Select>
          </div>

          {/* Company Mapping */}
          <div className="space-y-2">
            <Label htmlFor="company">Company Source *</Label>
            <Select
              id="company"
              value={companyColId}
              onChange={(e) => setCompanyColId(e.target.value)}
            >
              <option value="">Select a column...</option>
              {availableColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.header || col.id}
                </option>
              ))}
            </Select>
          </div>

          {/* Website Mapping (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="website">Website Source (Optional)</Label>
            <Select
              id="website"
              value={websiteColId}
              onChange={(e) => setWebsiteColId(e.target.value)}
            >
              <option value="">None</option>
              {availableColumns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.header || col.id}
                </option>
              ))}
            </Select>
          </div>

          {/* Run Options */}
          {onRun && (
            <div className="space-y-3 border-t pt-4">
              <Label>Run Options</Label>
              <div className="space-y-3">
                {isDemoMode() ? (
                  <div className="space-y-2">
                    <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-foreground">
                      <span className="font-medium">Demo deployment:</span> runs are fixed at {DEMO_MAX_ROWS}{' '}
                      rows. Larger batch sizes are not available in this environment.
                    </p>
                    <div className="text-xs text-muted-foreground">Rows to process: {DEMO_MAX_ROWS}</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={rowLimit === 'all' ? 'all' : rowLimit}
                      onChange={(e) => setRowLimit(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                      className="px-3 py-2 border rounded-md bg-background"
                    >
                      <option value={1}>1 row</option>
                      <option value={10}>10 rows</option>
                      <option value={50}>50 rows</option>
                      <option value={100}>100 rows</option>
                      <option value="all">All rows</option>
                    </select>
                    <div className="text-xs text-muted-foreground">
                      Number of rows to process when running
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="excludeProcessed" className="text-sm font-normal cursor-pointer">
                      Exclude already processed rows
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      Skip rows that already have valid email data
                    </div>
                  </div>
                  <Switch
                    id="excludeProcessed"
                    checked={excludeProcessed}
                    onCheckedChange={setExcludeProcessed}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isRunning}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isRunning || !firstNameColId || !lastNameColId || !companyColId}>
              {isSaving ? 'Saving...' : 'Save Mapping'}
            </Button>
            {onRun && (
              <Button
                onClick={handleRun}
                disabled={isSaving || isRunning || !firstNameColId || !lastNameColId || !companyColId}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Play className="h-4 w-4 mr-2" />
                {isRunning ? 'Running...' : 'Run Column'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
