import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

const DROPCONTACT_API_BASE = 'https://api.dropcontact.com/v1'

/**
 * POST Handler: Start DropContact enrichment
 * Accepts: { rowId, firstName, lastName, company, website, columnId }
 * Calls DropContact API and saves request_id to database
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 30, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { rowId, firstName, lastName, company, website, columnId } = body

    // Validation
    if (!rowId || typeof rowId !== 'string') {
      return NextResponse.json(
        { message: 'rowId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!columnId || typeof columnId !== 'string') {
      return NextResponse.json(
        { message: 'columnId is required and must be a string' },
        { status: 400 }
      )
    }

    // Check for API key
    const apiKey = process.env.DROPCONTACT_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { message: 'DropContact API is not configured' },
        { status: 500 }
      )
    }

    // Fetch the lead to get board_id and verify it exists
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, board_id, data')
      .eq('id', rowId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json(
        { message: 'Lead not found' },
        { status: 404 }
      )
    }

    // Fetch the column to get the normalized column name
    const { data: column, error: columnError } = await supabaseAdmin
      .from('board_columns')
      .select('id, name, board_id')
      .eq('id', columnId)
      .eq('board_id', lead.board_id)
      .single()

    if (columnError || !column) {
      return NextResponse.json(
        { message: 'Column not found or does not belong to this board' },
        { status: 404 }
      )
    }

    // Normalize column name for storage (same as AI enrichment)
    const columnKey = column.name.toLowerCase().replace(/\s+/g, '_')

    // Prepare DropContact API payload
    const dropcontactPayload = {
      data: [
        {
          first_name: firstName || '',
          last_name: lastName || '',
          company: company || '',
          website: website || '',
        },
      ],
      siren: true,
      language: 'en',
    }

    // Call DropContact API
    const dropcontactResponse = await fetch(`${DROPCONTACT_API_BASE}/enrich/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': apiKey,
      },
      body: JSON.stringify(dropcontactPayload),
    })

    if (!dropcontactResponse.ok) {
      const errorText = await dropcontactResponse.text()
      console.error('DropContact API error:', dropcontactResponse.status, errorText)
      return NextResponse.json(
        { message: `DropContact API error: ${dropcontactResponse.status}` },
        { status: dropcontactResponse.status }
      )
    }

    const dropcontactData = await dropcontactResponse.json()

    // Extract request_id from response
    const requestId = dropcontactData.request_id || dropcontactData.id
    if (!requestId) {
      console.error('DropContact response missing request_id:', dropcontactData)
      return NextResponse.json(
        { message: 'DropContact API did not return a request_id' },
        { status: 500 }
      )
    }

    // Save pending status to database
    const pendingValue = {
      type: 'dropcontact_pending',
      requestId: requestId,
      status: 'processing',
      timestamp: new Date().toISOString(),
    }

    // Update the lead's data field
    const updatedData = {
      ...lead.data,
      [columnKey]: pendingValue,
    }

    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ data: updatedData })
      .eq('id', rowId)

    if (updateError) {
      console.error('Error updating lead with pending status:', updateError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    console.log(`✅ DropContact enrichment started for lead ${rowId}, request_id: ${requestId}`)

    return NextResponse.json({
      success: true,
      requestId: requestId,
      message: 'DropContact enrichment started',
      status: 'processing',
    })
  } catch (error) {
    console.error('Error starting DropContact enrichment:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET Handler: Check status of DropContact enrichment
 * Query params: request_id (required)
 * Checks DropContact API and updates database with results
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 30, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('request_id')
    const boardId = searchParams.get('board_id')

    if (!requestId) {
      return NextResponse.json(
        { message: 'request_id query parameter is required' },
        { status: 400 }
      )
    }

    if (!boardId || typeof boardId !== 'string' || !boardId.trim()) {
      return NextResponse.json(
        { message: 'board_id query parameter is required' },
        { status: 400 }
      )
    }

    // Check for API key
    const apiKey = process.env.DROPCONTACT_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { message: 'DropContact API is not configured' },
        { status: 500 }
      )
    }

    // Call DropContact API to check status
    const dropcontactResponse = await fetch(`${DROPCONTACT_API_BASE}/enrich/all/${requestId}`, {
      method: 'GET',
      headers: {
        'X-Access-Token': apiKey,
      },
    })

    if (!dropcontactResponse.ok) {
      const errorText = await dropcontactResponse.text()
      console.error('DropContact status check error:', dropcontactResponse.status, errorText)
      return NextResponse.json(
        { message: `DropContact API error: ${dropcontactResponse.status}` },
        { status: dropcontactResponse.status }
      )
    }

    const dropcontactData = await dropcontactResponse.json()

    // Check if request is still processing
    if (!dropcontactData.success) {
      return NextResponse.json({
        success: false,
        status: 'processing',
        message: 'Enrichment is still in progress',
      })
    }

    // Extract email and qualification from response
    // Response structure: response.data[0].email[0].email
    let email: string | null = null
    let qualification: string | null = null

    if (dropcontactData.data && Array.isArray(dropcontactData.data) && dropcontactData.data.length > 0) {
      const firstResult = dropcontactData.data[0]

      // Extract email (usually in email array)
      if (firstResult.email && Array.isArray(firstResult.email) && firstResult.email.length > 0) {
        email = firstResult.email[0].email || null
      }

      // Extract qualification (e.g., "nominative@pro")
      qualification = firstResult.qualification || firstResult.qualif || null
    }

    // Find the lead(s) with this request_id
    // We need to search through all leads to find ones with this request_id
    // This is a bit inefficient, but necessary since we don't store request_id separately
    const { data: allLeads, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('id, board_id, data')
      .eq('board_id', boardId)

    if (fetchError) {
      console.error('Error fetching leads:', fetchError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    // Find leads with this request_id in any column
    const leadsToUpdate: Array<{ leadId: string; columnKey: string }> = []

    allLeads?.forEach((lead) => {
      if (lead.data && typeof lead.data === 'object') {
        Object.keys(lead.data).forEach((key) => {
          const value = lead.data[key]
          if (
            value &&
            typeof value === 'object' &&
            value.type === 'dropcontact_pending' &&
            value.requestId === requestId
          ) {
            leadsToUpdate.push({ leadId: lead.id, columnKey: key })
          }
        })
      }
    })

    if (leadsToUpdate.length === 0) {
      return NextResponse.json(
        { message: 'No leads found with this request_id' },
        { status: 404 }
      )
    }

    // Update all leads with the result
    const updatePromises = leadsToUpdate.map(async ({ leadId, columnKey }) => {
      // Fetch current lead data
      const { data: currentLead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('id, data')
        .eq('id', leadId)
        .single()

      if (leadError || !currentLead) {
        console.error(`Error fetching lead ${leadId}:`, leadError)
        return
      }

      // Create result value
      const resultValue = {
        type: 'dropcontact_result',
        email: email,
        qualification: qualification,
        requestId: requestId,
        timestamp: new Date().toISOString(),
      }

      // Update the lead's data field
      const updatedData = {
        ...currentLead.data,
        [columnKey]: resultValue,
      }

      const { error: updateError } = await supabaseAdmin
        .from('leads')
        .update({ data: updatedData })
        .eq('id', leadId)

      if (updateError) {
        console.error(`Error updating lead ${leadId}:`, updateError)
      } else {
        console.log(`✅ Updated lead ${leadId} with DropContact result`)
      }
    })

    await Promise.all(updatePromises)

    return NextResponse.json({
      success: true,
      status: 'completed',
      email: email,
      qualification: qualification,
      updatedLeads: leadsToUpdate.length,
      message: 'Enrichment completed and database updated',
    })
  } catch (error) {
    console.error('Error checking DropContact status:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
