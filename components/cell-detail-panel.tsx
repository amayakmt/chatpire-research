"use client"

import React from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Copy, ExternalLink, Clock, Cpu, Hash, TrendingUp, Search } from "lucide-react"
import { Lead } from "@/lib/types"

interface CellDetailPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cellData: {
    lead: Lead
    columnId: string
    columnName: string
    value: any
  } | null
}

// Validate that a URL uses only http or https protocols to prevent javascript: or data: URIs
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function CellDetailPanel({ open, onOpenChange, cellData }: CellDetailPanelProps) {
  if (!cellData) return null

  const { lead, columnId, columnName, value } = cellData

  // Check if value is an AI-rich-text object
  const isAIRichText = value && typeof value === 'object' && value.type === 'ai_rich_text'
  const displayValue = isAIRichText ? value?.value : value
  const metadata = isAIRichText ? value?.metadata : null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(displayValue || ''))
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Format time from milliseconds to readable format
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  // Format model name for display
  const formatModelName = (model: string) => {
    const modelMap: Record<string, string> = {
      // Supported models (Feb 2026)
      'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
      'gemini-3-flash-preview': 'Gemini 3 Flash',
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
      // Deprecated (may exist in historical data)
      'gemini-3.1-flash': 'Gemini 3.1 Flash (removed)',
      'gemini-3-pro-preview': 'Gemini 3 Pro (removed)',
      'gemini-2.0-flash': 'Gemini 2.0 Flash (removed)',
      'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite (removed)',
    }
    return modelMap[model] || model
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent onClose={() => onOpenChange(false)} className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>{columnName}</SheetTitle>
          <SheetDescription>
            {(lead.data?.full_name as string) || (lead.data?.company_name as string) || `Lead ${lead.id.slice(0, 8)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Main Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Content</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-2"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <div className="bg-muted/30 rounded-xl border border-border/60 p-4">
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {displayValue || <span className="text-muted-foreground italic">No content</span>}
              </div>
            </div>
          </div>

          {/* Metadata Section */}
          {metadata && (
            <div className="border-t border-border/60 pt-6 space-y-4">
              <h3 className="text-sm font-semibold">Metadata</h3>
              
              {/* Model & Time */}
              <div className="grid grid-cols-2 gap-3">
                {metadata.model && (
                  <div className="space-y-1.5 bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Cpu className="h-3.5 w-3.5" />
                      <span>Model</span>
                    </div>
                    <div className="text-sm font-medium">
                      {formatModelName(metadata.model)}
                    </div>
                  </div>
                )}
                {metadata.time_ms !== undefined && (
                  <div className="space-y-1.5 bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Execution Time</span>
                    </div>
                    <div className="text-sm font-medium tabular-nums">
                      {formatTime(metadata.time_ms)}
                    </div>
                  </div>
                )}
                {metadata.tokenCount !== undefined && metadata.tokenCount !== null && (
                  <div className="space-y-1.5 bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Hash className="h-3.5 w-3.5" />
                      <span>Tokens Used</span>
                    </div>
                    <div className="text-sm font-medium tabular-nums">
                      {metadata.tokenCount.toLocaleString()}
                    </div>
                  </div>
                )}
                {metadata.confidenceScore !== undefined && metadata.confidenceScore !== null && (
                  <div className="space-y-1.5 bg-muted/30 rounded-lg p-3 border border-border/40">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>Confidence</span>
                    </div>
                    <div className={`text-sm font-medium tabular-nums ${
                      metadata.confidenceScore < 0.7 
                        ? 'text-orange-600 dark:text-orange-500' 
                        : ''
                    }`}>
                      {Math.round(metadata.confidenceScore * 100)}%
                    </div>
                  </div>
                )}
              </div>

              {/* Search Query */}
              {metadata.searchQuery && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    <span>Search Query</span>
                  </div>
                  <div className="text-sm font-mono italic bg-muted/40 p-3 rounded-lg border border-border/40">
                    {metadata.searchQuery}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              {metadata?.timestamp && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">Generated</div>
                  <div className="text-sm">
                    {(() => {
                      let displayDate = 'Unknown date'
                      try {
                        displayDate = new Date(metadata.timestamp).toLocaleString()
                      } catch {
                        // keep default
                      }
                      return displayDate
                    })()}
                  </div>
                </div>
              )}

              {/* Sources */}
              {metadata?.sources && metadata.sources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Sources</div>
                  <div className="space-y-2">
                    {metadata.sources.map((source: { title: string; uri: string }, index: number) => {
                      const safeUri = source?.uri && isSafeUrl(source.uri) ? source.uri : null
                      return safeUri ? (
                        <a
                          key={index}
                          href={safeUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors group"
                        >
                          <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{source.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{source.uri}</div>
                          </div>
                        </a>
                      ) : (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/60"
                        >
                          <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{source?.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{source?.uri}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Error (if any) */}
              {metadata.error && (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground">Error</div>
                  <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 border border-destructive/20">{metadata.error}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
