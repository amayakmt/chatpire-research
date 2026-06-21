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

/**
 * A column as stored in the `board_columns` table — the single source of truth
 * for column metadata. `id` (UUID) is also the key under which a column's value
 * is stored in `leads.data`.
 */
export interface BoardColumn {
  id: string // UUID (board_columns.id)
  board_id?: string
  name: string // Display name
  type: string // 'text' | 'ai_enrichment' | 'dropcontact'
  order: number
  position?: number
  config?: ColumnAIConfig & { width?: number; color?: string }
}

export interface Board {
  id: string
  name: string
  /** Columns from the `board_columns` table, ordered by position/order. */
  columns?: BoardColumn[]
  created_at: string
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
