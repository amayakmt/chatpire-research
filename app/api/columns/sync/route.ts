import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

/**
 * Sync columns from leads data to board_columns table
 * This is useful for boards created before the board_columns migration
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { boardId } = body

    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json(
        { message: 'boardId is required and must be a string' },
        { status: 400 }
      )
    }

    // Verify the board exists
    const { data: board, error: boardError } = await supabaseAdmin
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .single()

    if (boardError || !board) {
      return NextResponse.json(
        { message: 'Board not found' },
        { status: 404 }
      )
    }

    // Fetch a sample of leads to extract column names
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('data')
      .eq('board_id', boardId)
      .limit(100) // Sample first 100 leads

    if (leadsError) {
      console.error('Error fetching leads for sync:', leadsError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { message: 'No leads found for this board' },
        { status: 404 }
      )
    }

    // Extract all unique column names from leads data
    const columnNames = new Set<string>()
    leads.forEach((lead) => {
      if (lead.data && typeof lead.data === 'object') {
        Object.keys(lead.data).forEach((key) => {
          if (key && key.trim() && key !== '__index') {
            columnNames.add(key)
          }
        })
      }
    })

    if (columnNames.size === 0) {
      return NextResponse.json(
        { message: 'No columns found in leads data' },
        { status: 404 }
      )
    }

    // Check which columns already exist
    const { data: existingColumns } = await supabaseAdmin
      .from('board_columns')
      .select('name')
      .eq('board_id', boardId)

    const existingNames = new Set(
      existingColumns?.map((col) => col.name) || []
    )

    // Create columns that don't exist (use exact keys)
    const columnsToInsert = Array.from(columnNames)
      .filter((key) => !existingNames.has(key))
      .sort()
      .map((key, index) => {
        // Estimate width based on key length
        const estimatedWidth = Math.min(Math.max(key.length * 8 + 40, 120), 400)

        // Get the next order value
        const baseOrder = existingColumns?.length || 0

        return {
          board_id: boardId,
          name: key, // Use exact key from database
          type: 'text', // Default type
          order: baseOrder + index,
          config: {
            width: estimatedWidth,
          },
        }
      })

    if (columnsToInsert.length === 0) {
      return NextResponse.json({
        message: 'All columns already exist',
        synced: 0,
        total: columnNames.size,
      })
    }

    // Insert new columns
    const { data: insertedColumns, error: insertError } = await supabaseAdmin
      .from('board_columns')
      .insert(columnsToInsert)
      .select()

    if (insertError) {
      console.error('Error syncing columns:', insertError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Columns synced successfully',
      synced: insertedColumns?.length || 0,
      total: columnNames.size,
      columns: insertedColumns,
    })
  } catch (error) {
    console.error('Error syncing columns:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
