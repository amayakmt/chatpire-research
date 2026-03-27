import { ColumnConfig, Lead } from './types'

/**
 * Escape a CSV field value according to RFC 4180
 * - If value contains comma, newline, or double quote, wrap in quotes
 * - Double quotes inside quoted fields must be escaped as ""
 */
function escapeCSVField(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }

  // Convert to string
  const stringValue = String(value)

  // Check if we need to quote the field
  const needsQuoting = stringValue.includes(',') || 
                       stringValue.includes('\n') || 
                       stringValue.includes('\r') || 
                       stringValue.includes('"')

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""')
    return `"${escaped}"`
  }

  return stringValue
}

/**
 * Extract the actual value from a cell, handling AI enrichment and DropContact results
 */
function extractCellValue(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }

  // Handle AI rich text objects
  if (typeof value === 'object' && value.type === 'ai_rich_text') {
    return value.value || ''
  }

  // Handle DropContact results
  if (typeof value === 'object' && value.type === 'dropcontact_result') {
    return value.email || value.qualification || ''
  }

  // Handle DropContact pending (show empty or status)
  if (typeof value === 'object' && value.type === 'dropcontact_pending') {
    return '' // Or could return 'Processing...' if preferred
  }

  // For other objects, try to stringify or return empty
  if (typeof value === 'object') {
    // If it's an array, join it
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    // Otherwise, try JSON stringify (for debugging) or return empty
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Get cell value from lead data using the same fallback logic as the frontend
 * This ensures consistency between what's displayed and what's exported
 */
function getCellValue(lead: Lead, columnConfig: ColumnConfig, boardColumns?: any[]): any {
  const data = lead.data || {}
  
  // Get column info from board.columns if available
  let columnUuid: string | undefined = undefined
  let columnName: string | undefined = undefined
  if (boardColumns && Array.isArray(boardColumns)) {
    const dbColumn = boardColumns.find((col: any) => 
      col.id === columnConfig.id || 
      col.name === columnConfig.id || 
      col.name === columnConfig.header ||
      (columnConfig.columnId && col.id === columnConfig.columnId)
    )
    if (dbColumn) {
      columnUuid = dbColumn.id // UUID from database
      columnName = dbColumn.name // Name from database
    }
  }
  
  // 1. Try Column UUID (from database) - The Ideal for new imports
  if (columnUuid && data[columnUuid] !== undefined && data[columnUuid] !== null) {
    return data[columnUuid]
  }
  // 2. Try config.id (might be UUID or name)
  if (data[columnConfig.id] !== undefined && data[columnConfig.id] !== null) {
    return data[columnConfig.id]
  }
  // 3. Try Column Name
  if (columnName && data[columnName] !== undefined && data[columnName] !== null) {
    return data[columnName]
  }
  // 4. Try Header
  if (columnConfig.header && data[columnConfig.header] !== undefined && data[columnConfig.header] !== null) {
    return data[columnConfig.header]
  }
  // 5. CRITICAL: Try normalized column name (API writes using this format)
  if (columnName) {
    const normalizedName = columnName.toLowerCase().replace(/\s+/g, '_')
    if (data[normalizedName] !== undefined && data[normalizedName] !== null) {
      return data[normalizedName]
    }
  }
  // Try normalized header
  if (columnConfig.header) {
    const normalizedHeader = columnConfig.header.toLowerCase().replace(/\s+/g, '_')
    if (data[normalizedHeader] !== undefined && data[normalizedHeader] !== null) {
      return data[normalizedHeader]
    }
  }
  // 6. Case-insensitive matching
  if (columnName) {
    const lowerName = columnName.toLowerCase()
    const matchingKey = Object.keys(data).find(k => k.toLowerCase() === lowerName)
    if (matchingKey) return data[matchingKey]
  }
  if (columnConfig.header) {
    const lowerHeader = columnConfig.header.toLowerCase()
    const matchingKey = Object.keys(data).find(k => k.toLowerCase() === lowerHeader)
    if (matchingKey) return data[matchingKey]
  }
  // 7. Case-insensitive matching with normalized format
  if (columnName) {
    const normalizedName = columnName.toLowerCase().replace(/\s+/g, '_')
    const matchingKey = Object.keys(data).find(k => k.toLowerCase().replace(/\s+/g, '_') === normalizedName)
    if (matchingKey) return data[matchingKey]
  }
  
  return undefined
}

/**
 * Convert board data to CSV format
 * 
 * @param columns - Array of column configurations (sorted by order)
 * @param leads - Array of lead data
 * @param boardColumns - Optional array of board columns from database (for UUID lookup)
 * @returns CSV string with BOM for Excel compatibility
 */
export function convertBoardToCSV(
  columns: ColumnConfig[],
  leads: Lead[],
  boardColumns?: any[]
): string {
  // Sort columns by order
  const sortedColumns = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  
  // Filter out the index column
  const dataColumns = sortedColumns.filter(col => col.id !== '__index')
  
  // Build header row
  const headers = dataColumns.map(col => escapeCSVField(col.header || col.id))
  const headerRow = headers.join(',')
  
  // Build data rows
  const rows: string[] = []
  
  for (const lead of leads) {
    const rowValues: string[] = []
    
    for (const column of dataColumns) {
      // Get the cell value using the same logic as the frontend
      const cellValue = getCellValue(lead, column, boardColumns)
      
      // Extract the actual display value (handle AI/DropContact objects)
      const displayValue = extractCellValue(cellValue)
      
      // Escape and add to row
      rowValues.push(escapeCSVField(displayValue))
    }
    
    rows.push(rowValues.join(','))
  }
  
  // Combine header and rows
  const csvContent = [headerRow, ...rows].join('\n')
  
  // Prepend BOM for Excel compatibility (handles special characters like accents/emojis)
  return '\uFEFF' + csvContent
}
