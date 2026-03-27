/**
 * Column Management API Routes
 *
 * CRITICAL DATA SAFETY RULES:
 * 1. Column renaming (PATCH with name) is VISUAL-ONLY
 * 2. NEVER modify JSON keys in leads.data during rename
 * 3. NEVER call RPC functions that touch leads table during rename
 * 4. Column UUID (id) is permanent - data keys remain unchanged
 * 5. Only DELETE handler touches leads (for cleanup on column deletion)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    // Fetch the column by UUID
    const { data: column, error } = await supabaseAdmin
      .from('board_columns')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Column fetch error:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!column) {
      return NextResponse.json(
        { message: 'Column not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ column })
  } catch (error) {
    console.error('Error fetching column:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH Handler: Update column metadata ONLY
 *
 * CRITICAL: This endpoint ONLY updates the `board_columns` table.
 * It NEVER touches the `leads` table or modifies JSON keys in lead data.
 *
 * Column renaming is a visual-only operation:
 * - The column UUID (`id`) remains constant
 * - The column display name (`name`) can change
 * - Data in `leads.data` is stored using normalized column names (e.g., "company_name")
 * - Renaming a column does NOT migrate JSON keys in leads - the data stays under the original key
 *
 * This ensures 100% data safety - renaming cannot cause data loss.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { name, type, order, config, metadata } = body

    // Build update object - ONLY for board_columns table fields
    const updateData: {
      name?: string
      type?: string
      order?: number
      config?: any
    } = {}

    // Validate and set name (display title only - does NOT affect leads data)
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { message: 'name must be a non-empty string' },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
      // NOTE: Changing name does NOT migrate JSON keys in leads.data
      // The column UUID (id) is permanent, and data keys remain unchanged
    }

    if (type !== undefined) {
      if (typeof type !== 'string') {
        return NextResponse.json(
          { message: 'type must be a string' },
          { status: 400 }
        )
      }
      updateData.type = type
    }

    if (order !== undefined) {
      if (typeof order !== 'number' || order < 0) {
        return NextResponse.json(
          { message: 'order must be a non-negative number' },
          { status: 400 }
        )
      }
      updateData.order = order
    }

    if (config !== undefined) {
      if (typeof config !== 'object' || config === null) {
        return NextResponse.json(
          { message: 'config must be an object' },
          { status: 400 }
        )
      }
      updateData.config = config
    }

    // Handle metadata update (merge into config.metadata)
    if (metadata !== undefined) {
      // Fetch current config to merge metadata
      const { data: currentColumn } = await supabaseAdmin
        .from('board_columns')
        .select('config')
        .eq('id', params.id)
        .single()

      const currentConfig = currentColumn?.config || {}
      updateData.config = {
        ...currentConfig,
        ...(config || {}), // Apply any config changes first
        metadata: metadata, // Then apply metadata
      }
    }

    // If no valid fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // CRITICAL: Update ONLY the board_columns table
    // This is a metadata-only operation - NO leads table access
    const { data, error } = await supabaseAdmin
      .from('board_columns')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Column update error:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Column not found' },
        { status: 404 }
      )
    }

    // Return updated column metadata
    // NOTE: This does NOT include any leads data - it's purely column configuration
    return NextResponse.json({ column: data })
  } catch (error) {
    console.error('Error updating column:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    // Try to find column by UUID first, then by name or normalized key (for backward compatibility)
    let column: { id: string; board_id: string; name: string } | null = null

    // First, try as UUID
    const { data: columnByUuid, error: uuidError } = await supabaseAdmin
      .from('board_columns')
      .select('id, board_id, name')
      .eq('id', params.id)
      .single()

    if (columnByUuid && !uuidError) {
      column = columnByUuid
    } else {
      // If not found by UUID, try by name or normalized key (for backward compatibility)
      // Get board_id from query params if available
      const searchParams = request.nextUrl.searchParams
      const boardId = searchParams.get('board_id')

      if (boardId) {
        // Try exact name match first
        const { data: columnByName, error: nameError } = await supabaseAdmin
          .from('board_columns')
          .select('id, board_id, name')
          .eq('board_id', boardId)
          .eq('name', params.id)
          .single()

        if (columnByName && !nameError) {
          column = columnByName
        } else {
          // Try normalized key match (old system uses "company_name", new uses "Company Name")
          // Normalize: convert "Company Name" to "company_name" and vice versa
          const normalizedParam = params.id.toLowerCase().replace(/\s+/g, '_')
          const { data: allColumns, error: allError } = await supabaseAdmin
            .from('board_columns')
            .select('id, board_id, name')
            .eq('board_id', boardId)

          if (allColumns && !allError) {
            // Find column where normalized name matches
            const matched = allColumns.find((col) => {
              const normalizedName = col.name.toLowerCase().replace(/\s+/g, '_')
              return normalizedName === normalizedParam || col.name === params.id
            })
            if (matched) {
              column = matched
            }
          }
        }
      }
    }

    if (!column) {
      return NextResponse.json(
        { message: 'Column not found' },
        { status: 404 }
      )
    }

    // Step 1: Clean up column data from leads FIRST (before removing metadata).
    // If cleanup fails, abort — leaving column metadata intact prevents data orphaning.
    const { error: cleanupError } = await supabaseAdmin.rpc('delete_board_column_by_uuid', {
      p_board_id: column.board_id,
      p_column_uuid: column.id,
    })

    if (cleanupError) {
      console.error('Failed to cleanup column data from leads:', cleanupError)
      return NextResponse.json(
        { message: 'Failed to remove column data from leads. Column was not deleted.' },
        { status: 500 }
      )
    }

    // Step 2: Only delete from board_columns after data cleanup succeeds.
    const { error: deleteError } = await supabaseAdmin
      .from('board_columns')
      .delete()
      .eq('id', column.id)

    if (deleteError) {
      console.error('Column delete error:', deleteError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Column deleted successfully',
      columnId: params.id,
    })
  } catch (error) {
    console.error('Error deleting column:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
