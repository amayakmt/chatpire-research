import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { boardId: string, ids: string[] }
 * Deletes all matching leads for the board in one query (.in('id', ids) + board_id).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 60, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const boardId = body?.boardId
    const ids = body?.ids

    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json({ message: 'boardId is required' }, { status: 400 })
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: 'ids must be a non-empty array' }, { status: 400 })
    }
    if (ids.length > 10_000) {
      return NextResponse.json({ message: 'Cannot delete more than 10000 rows per request' }, { status: 400 })
    }
    if (!ids.every((id: unknown) => typeof id === 'string' && UUID_RE.test(id))) {
      return NextResponse.json({ message: 'Every id must be a valid UUID' }, { status: 400 })
    }
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ message: 'ids must not contain duplicates' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('leads').delete().eq('board_id', boardId).in('id', ids)

    if (error) {
      console.error('bulk-delete leads:', error)
      return NextResponse.json({ message: 'Failed to delete rows' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted: ids.length })
  } catch (e) {
    console.error('POST /api/leads/bulk-delete', e)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
