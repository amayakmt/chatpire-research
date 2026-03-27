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
    // Fetch board
    const { data: board, error: boardError } = await supabaseAdmin
      .from('boards')
      .select('*')
      .eq('id', params.id)
      .single()

    if (boardError) {
      console.error('Board fetch error:', boardError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!board) {
      return NextResponse.json(
        { message: 'Board not found' },
        { status: 404 }
      )
    }

    // Fetch columns from board_columns table
    const { data: columns, error: columnsError } = await supabaseAdmin
      .from('board_columns')
      .select('*')
      .eq('board_id', params.id)
      .order('order', { ascending: true })

    if (columnsError) {
      console.error('Columns fetch error:', columnsError)
      // Don't fail the request if columns can't be fetched, just log it
      console.warn('Continuing without columns data')
    }

    // Return board with columns
    return NextResponse.json({
      board: {
        ...board,
        columns: columns || []
      }
    })
  } catch (error) {
    console.error('Error fetching board:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

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
    const { name, columns } = body

    // Build update object - only include fields that are provided
    const updateData: { name?: string; columns?: any } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json(
          { message: 'Board name must be a non-empty string' },
          { status: 400 }
        )
      }
      updateData.name = name.trim()
    }

    if (columns !== undefined) {
      // Validate columns - can be either:
      // 1. New format: { configs: ColumnConfig[], deletedIds: string[] }
      // 2. Old format: ColumnConfig[] (array)
      if (Array.isArray(columns)) {
        // Old format - keep as is
        updateData.columns = columns
      } else if (typeof columns === 'object' && columns !== null) {
        // New format - validate structure
        if ('configs' in columns && Array.isArray(columns.configs)) {
          updateData.columns = columns
        } else {
          return NextResponse.json(
            { message: 'Columns must be an array or an object with configs array' },
            { status: 400 }
          )
        }
      } else {
        return NextResponse.json(
          { message: 'Columns must be an array or an object with configs array' },
          { status: 400 }
        )
      }
    }

    // If no valid fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('boards')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Board update error:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Board not found' },
        { status: 404 }
      )
    }

    const response = NextResponse.json({ board: data })

    // Prevent caching to ensure fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response
  } catch (error) {
    console.error('Error updating board:', error)
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
    // First, verify the board exists
    const { data: existingBoard, error: checkError } = await supabaseAdmin
      .from('boards')
      .select('id')
      .eq('id', params.id)
      .single()

    if (checkError || !existingBoard) {
      return NextResponse.json(
        { message: 'Board not found' },
        { status: 404 }
      )
    }

    // Delete the board - CASCADE will automatically delete all related leads
    const { data: deletedData, error: deleteError } = await supabaseAdmin
      .from('boards')
      .delete()
      .eq('id', params.id)
      .select()

    if (deleteError) {
      console.error('Board delete error:', deleteError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    const response = NextResponse.json({
      message: 'Board deleted successfully',
      deleted: deletedData
    })

    // Prevent caching to ensure fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response
  } catch (error) {
    console.error('Error deleting board:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
