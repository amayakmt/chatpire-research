import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

/**
 * Returns every lead id for a board in display order (same as GET /api/leads).
 * Used so "Run on all rows" for AI columns does not depend on rendered table state.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const boardId = request.nextUrl.searchParams.get('board_id')
    if (!boardId) {
      return NextResponse.json({ message: 'board_id is required' }, { status: 400 })
    }

    const BATCH = 1000
    const ids: string[] = []
    let offset = 0

    for (;;) {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('board_id', boardId)
        .order('row_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .range(offset, offset + BATCH - 1)

      if (error) {
        console.error('Error fetching lead ids:', error)
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
      }

      if (!data?.length) break

      for (const row of data) {
        if (row?.id) ids.push(row.id)
      }

      if (data.length < BATCH) break
      offset += BATCH
    }

    const response = NextResponse.json({ ids })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  } catch (e) {
    console.error('Error in GET /api/leads/ids:', e)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
