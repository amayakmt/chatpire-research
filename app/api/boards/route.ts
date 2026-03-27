import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    // Fetch all boards with lead counts
    // TODO: N+1 query — lead counts are fetched one board at a time; replace with a single aggregate query
    const { data: boards, error: boardsError } = await supabaseAdmin
      .from('boards')
      .select('*')
      .order('created_at', { ascending: false })

    if (boardsError) {
      console.error('Boards fetch error:', boardsError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    // Get lead counts for each board
    const boardsWithCounts = await Promise.all(
      (boards || []).map(async (board) => {
        const { count, error } = await supabaseAdmin
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('board_id', board.id)

        return {
          ...board,
          leadCount: error ? 0 : (count || 0),
        }
      })
    )

    const response = NextResponse.json({ boards: boardsWithCounts })

    // Prevent caching to ensure fresh data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response
  } catch (error) {
    console.error('Error fetching boards:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
