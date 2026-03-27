export interface ColumnAIConfig {
  model?: string
  prompt?: string
  temperature?: number
  systemPrompt?: string
  [key: string]: unknown // allow additional DB-stored fields
}

export interface ColumnConfig {
  id: string // The key from the data object (e.g., "profileUrl")
  header: string // Display name (e.g., "LinkedIn Profile")
  width: number // Column width in pixels
  order: number // Display order (0, 1, 2, ...)
  /** @deprecated Use explicit column visibility logic instead of this field */
  visible?: boolean // Whether the column is visible (kept for backward compatibility)
  color?: string // Column header background color (hex code, e.g., "#3b82f6")
  type?: string // Column type (e.g., 'text', 'ai_enrichment', 'url')
  config?: ColumnAIConfig // Column configuration (JSONB from database, e.g., prompt, model settings)
  columnId?: string // UUID from board_columns table (for API calls)
}

export interface BoardColumnMetadata {
  configs: ColumnConfig[] // Column configurations
  deletedIds: string[] // IDs of columns that have been deleted
}

export interface Board {
  id: string
  name: string
  columns?: ColumnConfig[] // Optional, defaults to empty array
  created_at: string
  /**
   * When true, this board uses the new `board_columns` table for column storage.
   * When false or undefined, it uses the legacy `board.columns` JSONB field.
   */
  isNewColumnSystem?: boolean
}

export interface Lead {
  id: string
  board_id: string
  data: Record<string, unknown> // All CSV data stored as JSON
  created_at: string
}

export interface CSVRow {
  [key: string]: string
}

export interface CSVImportResult {
  success: boolean
  rowsImported: number
  errors?: string[]
}
