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
    const { boardName, firstChunk, columnOrder } = body

    if (!boardName || typeof boardName !== 'string') {
      return NextResponse.json(
        { message: 'Board name is required' },
        { status: 400 }
      )
    }

    if (boardName.length > 255) {
      return NextResponse.json(
        { message: 'Board name must be 255 characters or fewer' },
        { status: 400 }
      )
    }

    if (!firstChunk || !Array.isArray(firstChunk) || firstChunk.length === 0) {
      return NextResponse.json(
        { message: 'First chunk is required' },
        { status: 400 }
      )
    }

    if (firstChunk.length > 1000) {
      return NextResponse.json(
        { message: 'Too many leads in a single request (max 1000)' },
        { status: 413 }
      )
    }

    // Create the board first
    const { data: boardData, error: boardError } = await supabaseAdmin
      .from('boards')
      .insert({ name: boardName })
      .select()
      .single()

    if (boardError || !boardData) {
      console.error('Board creation error:', boardError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    const boardId = boardData.id

    // Scan chunk for any header keys not listed in columnOrder (older clients / edge cases)
    const columnMapFromData = new Map<string, string>() // normalized -> original spelling from data
    firstChunk.forEach((lead: { data: Record<string, any> }) => {
      if (lead.data && typeof lead.data === 'object') {
        Object.keys(lead.data).forEach((key) => {
          if (key && key.trim()) {
            const normalized = key.toLowerCase()
            if (!columnMapFromData.has(normalized)) {
              columnMapFromData.set(normalized, key)
            }
          }
        })
      }
    })

    // Ordered column names: CSV left-to-right when client sends columnOrder (Papa meta.fields);
    // never sort alphabetically. Append data-only keys after, in first-seen row order.
    const orderedColumnNames: string[] = []
    const seenNorm = new Set<string>()

    if (Array.isArray(columnOrder) && columnOrder.length > 0) {
      for (const raw of columnOrder) {
        if (typeof raw !== 'string' || !raw.trim()) continue
        const normalized = raw.trim().toLowerCase()
        if (seenNorm.has(normalized)) continue
        seenNorm.add(normalized)
        // Must match keys in lead.data (Papa field names from the client)
        orderedColumnNames.push(raw.trim())
      }
      for (const [normalized, original] of columnMapFromData) {
        if (!seenNorm.has(normalized)) {
          seenNorm.add(normalized)
          orderedColumnNames.push(original)
        }
      }
    } else {
      for (const [, original] of columnMapFromData) {
        const normalized = original.toLowerCase()
        if (!seenNorm.has(normalized)) {
          seenNorm.add(normalized)
          orderedColumnNames.push(original)
        }
      }
    }

    // Check for existing columns to prevent duplicates
    const { data: existingColumns } = await supabaseAdmin
      .from('board_columns')
      .select('name')
      .eq('board_id', boardId)

    const existingNames = new Set(
      (existingColumns || []).map((col) => col.name.toLowerCase())
    )

    // CRITICAL: Create columns FIRST, then transform data to use UUIDs as keys
    // This ensures data is stored with UUID keys, not header names
    const columnMapping: Record<string, string> = {} // header name -> column UUID

    if (orderedColumnNames.length > 0) {
      const columnsToInsert = orderedColumnNames
        .filter((original) => !existingNames.has(original.toLowerCase()))
        .map((original, index) => {
          const estimatedWidth = Math.min(Math.max(original.length * 8 + 40, 120), 400)

          return {
            board_id: boardId,
            name: original,
            type: 'text',
            order: index,
            config: {
              width: estimatedWidth,
            },
          }
        })

      // Insert columns in batch (only if there are new columns to insert)
      if (columnsToInsert.length > 0) {
        const { data: insertedColumns, error: columnsError } = await supabaseAdmin
          .from('board_columns')
          .insert(columnsToInsert)
          .select('id, name')

        if (columnsError) {
          console.error('Error creating columns:', columnsError)
          return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        }

        // Build mapping directly from inserted rows — avoids a second round-trip
        // and eliminates the race window where a concurrent request could insert columns between insert and fetch.
        if (insertedColumns) {
          insertedColumns.forEach((col) => {
            columnMapping[col.name] = col.id
          })
        }
      }
    }

    // CRITICAL: Transform data to use UUIDs as keys instead of header names
    // Transform: { "First Name": "John" } -> { "a1b2-c3d4...": "John" }
    // IMPORTANT: Preserve UTF-8 encoding throughout transformation
    const transformedChunk = firstChunk.map((lead: { data: Record<string, any> }) => {
      const transformedData: Record<string, any> = {}

      Object.keys(lead.data).forEach((headerName) => {
        const columnUuid = columnMapping[headerName]
        if (columnUuid) {
          // Use UUID as key and preserve UTF-8 encoding
          // Ensure value is properly encoded as UTF-8 string
          const value = lead.data[headerName]
          if (value !== undefined && value !== null) {
            // Convert to string if needed, preserving UTF-8 characters
            transformedData[columnUuid] = typeof value === 'string' ? value : String(value)
          }
        } else {
          // Log warning if mapping not found (shouldn't happen)
          console.warn(`No UUID mapping found for header: "${headerName}"`)
        }
      })

      return {
        board_id: boardId,
        data: transformedData,
      }
    })

    // Supabase has a limit of 1000 rows per insert, so we need to batch
    const SUPABASE_BATCH_SIZE = 1000
    const batches = []
    for (let i = 0; i < transformedChunk.length; i += SUPABASE_BATCH_SIZE) {
      batches.push(transformedChunk.slice(i, i + SUPABASE_BATCH_SIZE))
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
      // If all inserts failed, delete the board we created
      await supabaseAdmin.from('boards').delete().eq('id', boardId)

      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Board created and first chunk inserted successfully',
      boardId: boardId,
      inserted: totalInserted,
      columnMapping, // Return mapping for frontend to use for remaining chunks
    })
  } catch (error) {
    console.error('Create board error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
