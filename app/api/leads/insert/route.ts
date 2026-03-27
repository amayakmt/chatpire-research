/**
 * Insert Leads API Route
 *
 * CRITICAL: This route accepts data with header names and transforms them to UUIDs
 * using the columnMapping provided. If columnMapping is not provided, assumes
 * data is already using UUIDs (for backward compatibility).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    // CRITICAL: Ensure request body is parsed as UTF-8
    // Next.js request.json() automatically handles UTF-8, but we verify the content type
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { message: 'Content-Type must be application/json' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { boardId, leads, columnMapping } = body

    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json(
        { message: 'Board ID is required' },
        { status: 400 }
      )
    }

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { message: 'Invalid leads data' },
        { status: 400 }
      )
    }

    // Verify the requesting user owns this board (RLS-scoped supabaseAdmin)
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

    // CRITICAL: Transform data to use UUIDs as keys if columnMapping is provided
    // If columnMapping is not provided, assume data is already using UUIDs (backward compatibility)
    // IMPORTANT: Preserve UTF-8 encoding throughout transformation
    const transformedLeads = leads.map((lead: { data: Record<string, any> }) => {
      let transformedData: Record<string, any> = lead.data

      // If columnMapping is provided, transform header names to UUIDs
      if (columnMapping && typeof columnMapping === 'object') {
        transformedData = {}
        Object.keys(lead.data).forEach((key) => {
          // Check if key is already a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)

          // Preserve UTF-8 encoding when transforming values
          const value = lead.data[key]
          const utf8Value = value !== undefined && value !== null
            ? (typeof value === 'string' ? value : String(value))
            : value

          if (isUuid) {
            // Already a UUID, use as-is (preserve UTF-8)
            transformedData[key] = utf8Value
          } else if (columnMapping[key]) {
            // Map header name to UUID (preserve UTF-8)
            transformedData[columnMapping[key]] = utf8Value
          } else {
            // No mapping found - log warning but include the data (preserve UTF-8)
            console.warn(`No UUID mapping found for key: "${key}"`)
            transformedData[key] = utf8Value
          }
        })
      }

      return {
        board_id: boardId,
        data: transformedData,
      }
    })

    // Supabase has a limit of 1000 rows per insert, so we need to batch
    const SUPABASE_BATCH_SIZE = 1000
    const batches = []
    for (let i = 0; i < transformedLeads.length; i += SUPABASE_BATCH_SIZE) {
      batches.push(transformedLeads.slice(i, i + SUPABASE_BATCH_SIZE))
    }

    let totalInserted = 0
    const errors: string[] = []

    // Insert in batches
    for (const batch of batches) {
      const { data: insertedData, error: insertError } = await supabaseAdmin
        .from('leads')
        .insert(batch)
        .select()

      if (insertError) {
        errors.push(insertError.message)
        console.error('Batch insert error:', insertError)
      } else {
        totalInserted += insertedData?.length || 0
      }
    }

    if (errors.length > 0 && totalInserted === 0) {
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Leads inserted successfully',
      inserted: totalInserted,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Insert leads error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
