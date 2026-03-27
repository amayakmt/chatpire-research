import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { boardId, name, type = 'text', order, config = {}, metadata } = body

    // Validation
    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json(
        { message: 'boardId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { message: 'name is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (name.length > 255) {
      return NextResponse.json(
        { message: 'Column name must be 255 characters or fewer' },
        { status: 400 }
      )
    }

    if (!type || typeof type !== 'string') {
      return NextResponse.json(
        { message: 'type is required and must be a string' },
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

    // Get the next order value if not provided
    let finalOrder = order
    if (finalOrder === undefined) {
      const { data: existingColumns } = await supabaseAdmin
        .from('board_columns')
        .select('order')
        .eq('board_id', boardId)
        .order('order', { ascending: false })
        .limit(1)

      finalOrder = existingColumns && existingColumns.length > 0
        ? (existingColumns[0].order || 0) + 1
        : 0
    }

    // Prepare insert data
    const insertData: any = {
      board_id: boardId,
      name: name.trim(),
      type,
      order: finalOrder,
      config: config || {},
    }

    // Add metadata if provided (store in config.metadata for now, or as separate field if DB supports it)
    if (metadata !== undefined) {
      // Store metadata in config for now (can be moved to separate column later)
      insertData.config = {
        ...insertData.config,
        metadata: metadata,
      }
    }

    // Insert the new column
    const { data, error } = await supabaseAdmin
      .from('board_columns')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Column create error:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ column: data }, { status: 201 })
  } catch (error) {
    console.error('Error creating column:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
