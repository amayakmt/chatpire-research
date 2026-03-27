import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!hasUrl || !hasKey) {
      return NextResponse.json({
        status: 'error',
        message: 'Missing Supabase environment variables',
        env: {
          url: hasUrl,
          key: hasKey,
        },
      }, { status: 500 })
    }

    // Test Supabase connection by querying boards table
    const { data, error } = await supabase
      .from('boards')
      .select('id')
      .limit(1)

    if (error) {
      return NextResponse.json({
        status: 'error',
        message: 'Health check failed',
      }, { status: 500 })
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Supabase connection successful',
      tables: {
        boards: 'accessible',
      },
    })
  } catch {
    return NextResponse.json({
      status: 'error',
      message: 'Health check failed',
    }, { status: 500 })
  }
}
