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
    const { boardId, columnId } = body

    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json(
        { message: 'Board ID is required' },
        { status: 400 }
      )
    }

    if (!columnId || typeof columnId !== 'string') {
      return NextResponse.json(
        { message: 'Column ID is required' },
        { status: 400 }
      )
    }

    // Call the RPC function to delete the column from all leads in a single transaction
    const { data, error } = await supabaseAdmin.rpc('delete_board_column', {
      p_board_id: boardId,
      p_column_id: columnId,
    })

    if (error) {
      console.error('Error calling delete_board_column RPC:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    const updatedCount = data || 0

    return NextResponse.json({
      message: 'Column removed from leads successfully',
      updated: updatedCount,
    })
  } catch (error) {
    console.error('Error removing column from leads:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
