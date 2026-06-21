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

    // Fetch columns from board_columns — sort by position (canonical), then order, then id
    let columns: any[] | null = null
    const { data: byPosition, error: posErr } = await supabaseAdmin
      .from('board_columns')
      .select('*')
      .eq('board_id', params.id)
      .order('position', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })

    if (!posErr && byPosition) {
      columns = byPosition
    } else {
      const { data: byOrder, error: orderErr } = await supabaseAdmin
        .from('board_columns')
        .select('*')
        .eq('board_id', params.id)
        .order('order', { ascending: true })
        .order('id', { ascending: true })

      if (orderErr) {
        console.error('Columns fetch error:', orderErr)
        console.warn('Continuing without columns data')
      } else {
        columns = byOrder
      }
    }

    const normalizedColumns = (columns || []).map((col) => ({
      ...col,
      order: col.position ?? col.order ?? 0,
    }))

    // Columns are always sourced from the board_columns table (single source of truth).
    return NextResponse.json({
      board: {
        ...board,
        columns: normalizedColumns,
      },
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
    const { name } = body

    // Board PATCH only renames the board. Column changes go through the
    // /api/columns/* endpoints (board_columns table is the single source of truth).
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { message: 'Board name must be a non-empty string' },
        { status: 400 }
      )
    }

    const updateData = { name: name.trim() }

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
