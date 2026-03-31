import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST body: { orderedColumnIds: string[] } — UUIDs in desired left-to-right order.
 * Persists to board_columns.position and board_columns.order in one DB round-trip when
 * apply_board_column_positions exists (see SQL_BOARD_COLUMNS_POSITION.sql).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const boardId = params.id
    const body = await request.json()
    const orderedColumnIds = body?.orderedColumnIds

    if (!Array.isArray(orderedColumnIds) || orderedColumnIds.length === 0) {
      return NextResponse.json(
        { message: 'orderedColumnIds must be a non-empty array of column UUIDs' },
        { status: 400 }
      )
    }

    if (!orderedColumnIds.every((id: unknown) => typeof id === 'string' && UUID_RE.test(id))) {
      return NextResponse.json(
        { message: 'Every orderedColumnIds entry must be a valid UUID string' },
        { status: 400 }
      )
    }

    if (new Set(orderedColumnIds).size !== orderedColumnIds.length) {
      return NextResponse.json(
        { message: 'orderedColumnIds must not contain duplicates' },
        { status: 400 }
      )
    }

    const { data: boardRow, error: boardErr } = await supabaseAdmin
      .from('boards')
      .select('id')
      .eq('id', boardId)
      .single()

    if (boardErr || !boardRow) {
      return NextResponse.json({ message: 'Board not found' }, { status: 404 })
    }

    const { data: existing, error: colErr } = await supabaseAdmin
      .from('board_columns')
      .select('id')
      .eq('board_id', boardId)

    if (colErr) {
      console.error('reorder: list columns', colErr)
      return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
    }

    const allowed = new Set((existing || []).map((r) => r.id))
    if (orderedColumnIds.length !== allowed.size) {
      return NextResponse.json(
        { message: 'orderedColumnIds must include every column on the board exactly once' },
        { status: 400 }
      )
    }
    for (const id of orderedColumnIds) {
      if (!allowed.has(id)) {
        return NextResponse.json(
          { message: 'orderedColumnIds contains an id that does not belong to this board' },
          { status: 400 }
        )
      }
    }

    const positions = orderedColumnIds.map((_, i) => i)

    const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc('apply_board_column_positions', {
      p_board_id: boardId,
      p_ids: orderedColumnIds,
      p_positions: positions,
    })

    if (!rpcError) {
      return NextResponse.json({
        ok: true,
        updated: typeof rpcRows === 'number' ? rpcRows : orderedColumnIds.length,
        method: 'rpc',
      })
    }

    console.warn('apply_board_column_positions RPC failed; falling back to batched updates:', rpcError)

    const updates = orderedColumnIds.map((columnId, index) =>
      supabaseAdmin
        .from('board_columns')
        .update({ position: index, order: index })
        .eq('id', columnId)
        .eq('board_id', boardId)
    )

    const results = await Promise.all(updates)
    const firstErr = results.find((r) => r.error)?.error
    if (firstErr) {
      const onlyOrder = await Promise.all(
        orderedColumnIds.map((columnId, index) =>
          supabaseAdmin
            .from('board_columns')
            .update({ order: index })
            .eq('id', columnId)
            .eq('board_id', boardId)
        )
      )
      const err2 = onlyOrder.find((r) => r.error)?.error
      if (err2) {
        console.error('reorder fallback failed:', err2)
        return NextResponse.json(
          {
            message:
              'Could not persist column order. Run SQL_BOARD_COLUMNS_POSITION.sql in Supabase, or ensure board_columns has order/position columns.',
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ ok: true, updated: orderedColumnIds.length, method: 'patch_order_only' })
    }

    return NextResponse.json({ ok: true, updated: orderedColumnIds.length, method: 'patch_parallel' })
  } catch (e) {
    console.error('POST /api/boards/.../columns/reorder', e)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
