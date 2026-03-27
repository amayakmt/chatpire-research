'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ColumnConfig } from '@/lib/types'
import { Sparkles, ChevronDown, ChevronUp, X, Play, Save, FileText, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { ModelSelect } from '@/components/model-select'
import { MessageEditor, Message } from '@/components/message-editor'

interface AIConfigurationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
  columnConfig: ColumnConfig
  columnConfigs: ColumnConfig[]
  onSave: (config: {
    messages: Message[]
    model: string
    temperature: number
    useWebSearch: boolean
    systemInstruction?: string
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  }) => Promise<void>
  onRun: (rowLimit: number | 'all', excludeProcessed?: boolean) => Promise<void>
  leads?: Array<{ id: string; data: Record<string, any> }>
}

export function AIConfigurationModal({
  open,
  onOpenChange,
  boardId,
  columnConfig,
  columnConfigs,
  onSave,
  onRun,
  leads = [],
}: AIConfigurationModalProps) {
  // Load saved config from columnConfig (stored in column.config in Supabase)
  const savedConfig = (columnConfig as any).config || {}
  
  // Backward compatibility: Convert old prompt string to messages array
  const getInitialMessages = (): Message[] => {
    if (savedConfig.messages && Array.isArray(savedConfig.messages)) {
      return savedConfig.messages
    }
    // Old format: single prompt string
    if (savedConfig.prompt) {
      return [{ role: 'user', content: savedConfig.prompt }]
    }
    // Default: empty user message
    return [{ role: 'user', content: '' }]
  }
  
  const [messages, setMessages] = useState<Message[]>(getInitialMessages())
  const [selectedModel, setSelectedModel] = useState(savedConfig.model || 'gemini-3-flash-preview')
  const [thinkingLevel, setThinkingLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | ''>(
    savedConfig.thinkingLevel || ''
  )
  const [temperature, setTemperature] = useState(savedConfig.temperature !== undefined ? savedConfig.temperature : 0.0)
  const [useWebSearch, setUseWebSearch] = useState(savedConfig.useWebSearch || false)
  const [systemInstruction, setSystemInstruction] = useState(savedConfig.systemInstruction || '')

  // Memoize the config to detect changes reliably
  const configString = useMemo(() => {
    return JSON.stringify((columnConfig as any).config || {})
  }, [(columnConfig as any).config])

  // Sync state with columnConfig when it changes (e.g., after saving or when modal opens)
  useEffect(() => {
    if (!open) return // Don't update when modal is closed

    const currentSavedConfig = (columnConfig as any).config || {}

    // Update messages if they exist in saved config
    if (currentSavedConfig.messages && Array.isArray(currentSavedConfig.messages)) {
      setMessages(currentSavedConfig.messages)
    } else if (currentSavedConfig.prompt) {
      setMessages([{ role: 'user', content: currentSavedConfig.prompt }])
    } else {
      setMessages([{ role: 'user', content: '' }])
    }

    if (currentSavedConfig.model !== undefined && currentSavedConfig.model !== null) {
      setSelectedModel(currentSavedConfig.model)
    }

    if (currentSavedConfig.temperature !== undefined) {
      setTemperature(currentSavedConfig.temperature)
    }

    if (currentSavedConfig.useWebSearch !== undefined) {
      setUseWebSearch(currentSavedConfig.useWebSearch)
    }

    if (currentSavedConfig.systemInstruction !== undefined) {
      setSystemInstruction(currentSavedConfig.systemInstruction || '')
    }

    if (currentSavedConfig.thinkingLevel !== undefined) {
      setThinkingLevel(currentSavedConfig.thinkingLevel || '')
    }

    setShowSaveTemplate(false)
    setTemplateName('')
    setShowTemplateManager(false)
    setEditingTemplateId(null)
    setHasUnsavedChanges(false)
  }, [open, columnConfig?.id, configString]) // Use configString to detect nested changes; do NOT depend on columnConfig reference alone
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [rowLimit, setRowLimit] = useState<number | 'all'>(1)
  const [excludeProcessed, setExcludeProcessed] = useState<boolean>(true)
  
  // Template-related state
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; content: string; created_at: string }>>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingTemplateName, setEditingTemplateName] = useState<string>('')
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Model definitions — Feb 2026 documentation (5 supported models only)
  const models = [
    // ── Gemini 3.1 Series ───────────────────────────────────────
    {
      id: 'gemini-3.1-pro-preview',
      name: 'Gemini 3.1 Pro',
      description: 'Advanced reasoning & agentic coding.',
      price: 'Input $2.00/1M | Output $12.00/1M',
      isNew: true,
      category: 'pro' as const,
      isPremium: true,
    },
    // ── Gemini 3.0 Series ───────────────────────────────────────
    {
      id: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      description: 'Ultra-low latency frontier-class performance.',
      price: 'Input $0.50/1M | Output $3.00/1M',
      isNew: true,
      category: 'flash' as const,
    },
    // ── Gemini 2.5 Series ───────────────────────────────────────
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Coding & Complex Tasks',
      price: 'Input $1.25/1M | Output $10.00/1M',
      isNew: false,
      category: 'pro' as const,
      isPremium: true,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'General Purpose',
      price: 'Input $0.30/1M | Output $2.50/1M',
      isNew: false,
      category: 'flash' as const,
    },
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash Lite',
      description: 'Most economical (Cheapest).',
      price: 'Input $0.10/1M | Output $0.40/1M',
      isNew: false,
      category: 'flash' as const,
    },
  ]

  // Detect if the selected model supports thinking mode
  const supportsThinking = selectedModel.startsWith('gemini-3.1-pro')

  // Load templates when modal opens
  useEffect(() => {
    if (open) {
      fetchTemplates()
    }
  }, [open])

  // Fetch all prompt templates
  const fetchTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const response = await fetch('/api/prompt-templates')
      if (!response.ok) {
        throw new Error('Failed to fetch templates')
      }
      const data = await response.json()
      setTemplates(data.templates || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
      // Don't show alert, just log the error
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  // Handle template selection (from manager modal)
  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      try {
        // Try to parse as JSON (new format: messages array)
        const parsed = JSON.parse(template.content)
        if (Array.isArray(parsed) && parsed.every(m => m.role && typeof m.content === 'string')) {
          // It's a valid message array - load it directly
          setMessages(parsed as Message[])
          console.log(`✅ Loaded template "${template.name}" with ${parsed.length} messages`)
        } else {
          // Parsed successfully but not a valid message array - treat parsed value as string content
          const content = typeof parsed === 'string' ? parsed : String(parsed)
          setMessages([{ role: 'user', content }])
          console.log(`⚠️ Template "${template.name}" parsed but not a message array, treating as single user message`)
        }
      } catch {
        // Not JSON, treat as plain string (backward compatibility with old templates)
        setMessages([{ role: 'user', content: template.content }])
        console.log(`📝 Loaded template "${template.name}" as plain string (backward compatibility)`)
      }
      setShowTemplateManager(false) // Close manager modal
    }
  }

  // Handle template rename
  const handleTemplateRename = async (templateId: string, newName: string) => {
    if (!newName.trim()) {
      alert('Template name cannot be empty')
      return
    }

    try {
      const response = await fetch('/api/prompt-templates', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: templateId,
          name: newName.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to rename template')
      }

      // Update local state
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, name: newName.trim() } : t))
      )
      setEditingTemplateId(null)
      setEditingTemplateName('')
    } catch (error) {
      console.error('Error renaming template:', error)
      alert(error instanceof Error ? error.message : 'Failed to rename template')
    }
  }

  // Handle template delete
  const handleTemplateDelete = async (templateId: string) => {
    // Optimistic UI update
    setTemplates((prev) => prev.filter((t) => t.id !== templateId))
    setItemToDelete(null) // Close confirmation dialog

    try {
      const response = await fetch('/api/prompt-templates', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: templateId }),
      })

      if (!response.ok) {
        // Revert on error
        await fetchTemplates()
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to delete template')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      // Revert on error
      await fetchTemplates()
      alert(error instanceof Error ? error.message : 'Failed to delete template')
    }
  }

  // Handle save as template
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name')
      return
    }

    // Check if there's at least one message with content
    const hasContent = messages.some(m => m.content.trim())
    if (!hasContent) {
      alert('Please enter at least one message to save as template')
      return
    }

    setIsSavingTemplate(true)
    try {
      const response = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName.trim(),
          // Save messages as JSON for future-proofing
          content: JSON.stringify(messages),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to save template')
      }

      // Refresh templates list
      await fetchTemplates()
      
      // Reset save template UI
      setShowSaveTemplate(false)
      setTemplateName('')
      
      // Show success message (optional)
      // You could use a toast notification here instead
    } catch (error) {
      console.error('Error saving template:', error)
      alert(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  // Get available column headers (excluding index column and current column)
  // Memoized to avoid recomputing on every render
  const availableColumns = useMemo(
    () =>
      columnConfigs
        .filter((config) => config.id !== '__index' && config.id !== columnConfig.id && config.header)
        .map((config) => config.header)
        .filter((header): header is string => typeof header === 'string' && header.length > 0),
    [columnConfigs, columnConfig.id]
  )


  // Extract variables from all messages
  const extractVariables = (messages: Message[]): string[] => {
    const allText = messages.map(m => m.content).join(' ')
    const regex = /\{\{(\w+)\}\}/g
    const matches = allText.matchAll(regex)
    const variables = Array.from(matches, (m) => m[1])
    return [...new Set(variables)] // Remove duplicates
  }

  const variables = extractVariables(messages)

  const handleSave = async () => {
    // Check if there's at least one message with content
    const hasContent = messages.some(m => m.content.trim())
    if (!hasContent) {
      alert('Please enter at least one message')
      return
    }

    setIsSaving(true)
    try {
      await onSave({
        messages,
        model: selectedModel,
        temperature,
        useWebSearch,
        systemInstruction,
        ...(thinkingLevel ? { thinkingLevel } : {}),
      })
      setHasUnsavedChanges(false)
      // Don't close modal after save - allow user to run immediately
    } catch (error) {
      console.error('Error saving configuration:', error)
      alert(error instanceof Error ? error.message : 'Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRun = async () => {
    const hasContent = messages.some(m => m.content.trim())
    if (!hasContent) {
      alert('Please enter at least one message')
      return
    }

    setIsRunning(true)
    try {
      // Persist latest UI state first so enrichment uses the current prompt/settings
      await onSave({
        messages,
        model: selectedModel,
        temperature,
        useWebSearch,
        systemInstruction,
        ...(thinkingLevel ? { thinkingLevel } : {}),
      })
      setHasUnsavedChanges(false)
      await onRun(rowLimit, excludeProcessed)
      onOpenChange(false) // Close modal after starting run
    } catch (error) {
      console.error('Error running enrichment:', error)
      alert(error instanceof Error ? error.message : 'Failed to run enrichment')
    } finally {
      setIsRunning(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && hasUnsavedChanges) {
        if (!window.confirm('You have unsaved changes. Close anyway?')) return
      }
      onOpenChange(nextOpen)
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Column Configuration: {columnConfig.header}
          </DialogTitle>
          <DialogDescription>
            Configure the AI prompt and settings for this column. Run Column saves your changes automatically, then starts enrichment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Model Selection */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <ModelSelect
              value={selectedModel}
              onChange={(m) => {
                setSelectedModel(m)
                // Reset thinking level when switching away from a thinking-capable model
                if (!m.startsWith('gemini-3.1-pro')) {
                  setThinkingLevel('')
                }
                setHasUnsavedChanges(true)
              }}
              options={models}
            />
          </div>

          {/* Thinking Level (only for 3.1 Pro) */}
          {supportsThinking && (
            <div className="space-y-2">
              <Label htmlFor="thinkingLevel">Reasoning Depth (Thinking Mode)</Label>
              <select
                id="thinkingLevel"
                value={thinkingLevel}
                onChange={(e) => {
                  setThinkingLevel(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | '')
                  setHasUnsavedChanges(true)
                }}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              >
                <option value="">Off — No thinking</option>
                <option value="LOW">Low — Quick reasoning (~1K tokens)</option>
                <option value="MEDIUM">Medium — Balanced reasoning (~8K tokens)</option>
                <option value="HIGH">High — Deep reasoning (~24K tokens)</option>
              </select>
              <div className="text-xs text-muted-foreground">
                Enables the model to &quot;think&quot; before responding. Higher levels produce more
                thorough analysis but use more tokens and take longer.
              </div>
            </div>
          )}

          {/* Message Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Chat Messages</Label>
            </div>
            <MessageEditor
              messages={messages}
              onChange={(msgs) => { setMessages(msgs); setHasUnsavedChanges(true) }}
              availableColumns={availableColumns}
            />
            {variables.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Variables detected: {variables.join(', ')}
              </div>
            )}
            
            {/* Template Management Buttons */}
            <div className="flex items-center gap-2 pt-2">
              {!showSaveTemplate ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveTemplate(true)}
                    disabled={!messages.some(m => m.content.trim())}
                    className="text-xs"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Save as Template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      fetchTemplates()
                      setShowTemplateManager(true)
                    }}
                    className="text-xs"
                  >
                    <FolderOpen className="h-3 w-3 mr-1" />
                    Manage Templates
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <Input
                    type="text"
                    placeholder="Template name..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="flex-1 text-sm"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSaveTemplate(false)
                      setTemplateName('')
                    }}
                    disabled={isSavingTemplate}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveAsTemplate}
                    disabled={isSavingTemplate || !templateName.trim() || !messages.some(m => m.content.trim())}
                  >
                    {isSavingTemplate ? 'Saving...' : (
                      <>
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="space-y-4 pl-6 border-l-2">
                <div className="space-y-2">
                  <Label htmlFor="systemInstruction">System Instruction (Optional)</Label>
                  <Textarea
                    id="systemInstruction"
                    value={systemInstruction}
                    onChange={(e) => setSystemInstruction(e.target.value)}
                    placeholder="You are a helpful assistant..."
                    className="min-h-[80px] text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="temperature">Temperature: {temperature}</Label>
                  </div>
                  <Slider
                    id="temperature"
                    value={temperature}
                    onValueChange={(value) => { setTemperature(value); setHasUnsavedChanges(true) }}
                    min={0}
                    max={2}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground">
                    Lower = more deterministic, Higher = more creative
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="webSearch">Enable Web Search</Label>
                    <div className="text-xs text-muted-foreground">
                      Allow the model to search the web for real-time information
                    </div>
                  </div>
                  <Switch
                    id="webSearch"
                    checked={useWebSearch}
                    onCheckedChange={(v) => { setUseWebSearch(v); setHasUnsavedChanges(true) }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Run Options */}
          <div className="space-y-3 border-t pt-4">
            <Label>Run Options</Label>
            <div className="space-y-3">
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
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="excludeProcessed" className="text-sm font-normal cursor-pointer">
                    Exclude already processed rows
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Skip rows that already have valid data
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving || isRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isRunning || !messages.some(m => m.content.trim())}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button
              onClick={handleRun}
              disabled={isSaving || isRunning || !messages.some(m => m.content.trim())}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Running...' : 'Run Column'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Template Manager Modal */}
      <Dialog open={showTemplateManager} onOpenChange={setShowTemplateManager}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-purple-500" />
              Saved Templates
            </DialogTitle>
            <DialogDescription>
              Select a template to load, or manage your saved templates.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isLoadingTemplates ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No templates saved yet. Create one by clicking &ldquo;Save as Template&rdquo; in the main configuration.
              </div>
            ) : (
              <div className="space-y-1">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center gap-2 p-3 rounded-md border hover:bg-accent transition-colors group"
                  >
                    {editingTemplateId === template.id ? (
                      <>
                        <Input
                          type="text"
                          value={editingTemplateName}
                          onChange={(e) => setEditingTemplateName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTemplateRename(template.id, editingTemplateName)
                            } else if (e.key === 'Escape') {
                              setEditingTemplateId(null)
                              setEditingTemplateName('')
                            }
                          }}
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingTemplateId(null)
                            setEditingTemplateName('')
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleTemplateRename(template.id, editingTemplateName)}
                          disabled={!editingTemplateName.trim()}
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTemplateSelect(template.id)}
                          className="flex-1 text-left hover:text-purple-600 transition-colors"
                        >
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(template.created_at).toLocaleDateString()}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTemplateId(template.id)
                              setEditingTemplateName(template.name)
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setItemToDelete(template.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowTemplateManager(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={itemToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setItemToDelete(null)
          }
        }}
        title="Delete Template?"
        description="Are you sure you want to delete this template? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          if (itemToDelete) {
            handleTemplateDelete(itemToDelete)
          }
        }}
      />
    </Dialog>
  )
}
