import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const boardId = searchParams.get('board_id')
    const startParam = searchParams.get('start')
    const limitParam = searchParams.get('limit')

    if (!boardId) {
      return NextResponse.json(
        { message: 'board_id is required' },
        { status: 400 }
      )
    }

    // Parse start and limit parameters with guards
    const startRaw = startParam ? parseInt(startParam, 10) : 0
    if (startParam && (isNaN(startRaw) || startRaw < 0)) {
      return NextResponse.json(
        { message: '`start` must be a non-negative integer' },
        { status: 400 }
      )
    }
    const start = startRaw

    // Omitted `limit` = fetch every row for this board (batched). limit=0 means the same.
    let limit: number | null = null
    if (limitParam !== null && limitParam !== '') {
      const limitRaw = parseInt(limitParam, 10)
      if (isNaN(limitRaw) || limitRaw < 0) {
        return NextResponse.json(
          { message: '`limit` must be a non-negative integer' },
          { status: 400 }
        )
      }
      if (limitRaw === 0) {
        limit = null
      } else {
        limit = Math.min(limitRaw, 5000)
      }
    } else {
      limit = null
    }

    // Always get the total count first (regardless of limit)
    const { count, error: countError } = await supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId)

    if (countError) {
      console.error('Count error:', countError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    const totalRows = count || 0

    let allLeads: any[] = []

    if (limit !== null && limit > 0) {
      // Fetch with limit (single query)
      const end = start + limit - 1
      const { data, error: fetchError } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('board_id', boardId)
        .order('row_order', { ascending: true, nullsFirst: false }) // nullsFirst: false = nulls last
        .order('created_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }) // Final tiebreaker for absolute stability
        .range(start, end)

      if (fetchError) {
        console.error('Error fetching leads:', fetchError)
        return NextResponse.json(
          { message: 'Internal server error' },
          { status: 500 }
        )
      }

      allLeads = data || []
    } else {
      // Fetch all rows in batches (when limit is null or 0)
      const SUPABASE_MAX_ROWS = 1000
      let offset = start

      while (offset < totalRows) {
        const end = Math.min(offset + SUPABASE_MAX_ROWS - 1, totalRows - 1)

        const { data: batchData, error: batchError } = await supabaseAdmin
          .from('leads')
          .select('*')
          .eq('board_id', boardId)
          .order('row_order', { ascending: true, nullsFirst: false }) // nullsFirst: false = nulls last
          .order('created_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true }) // Final tiebreaker for absolute stability
          .range(offset, end)

        if (batchError) {
          console.error(`Error fetching batch at offset ${offset}:`, batchError)
          return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        }

        if (batchData && batchData.length > 0) {
          allLeads.push(...batchData)
        }

        // If we got fewer rows than expected, we've reached the end
        if (!batchData || batchData.length < SUPABASE_MAX_ROWS || end >= totalRows - 1) {
          break
        }

        offset += SUPABASE_MAX_ROWS
      }
    }

    const response = NextResponse.json({
      leads: allLeads,
      total: totalRows,
    })

    // Prevent caching to ensure fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response
  } catch (error) {
    console.error('Error fetching leads:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
