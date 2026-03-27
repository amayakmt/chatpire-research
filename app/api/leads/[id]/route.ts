import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { path, value } = body

    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { message: 'Path is required and must be a string' },
        { status: 400 }
      )
    }

    // CRITICAL: Validate that path is a UUID (column identifier)
    // Pragmatic Programmer: Fail Fast - validate input early
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(path)) {
      return NextResponse.json(
        {
          message: 'Path must be a valid column UUID. Nested paths and non-UUID keys are not supported.',
          received: path
        },
        { status: 400 }
      )
    }

    // Validate that path is a simple key (no nested paths)
    if (path.includes('.') || path.includes('[') || path.includes(']')) {
      return NextResponse.json(
        { message: 'Nested paths are not supported. Use a column UUID.' },
        { status: 400 }
      )
    }

    // Fetch the current lead to get existing data
    const { data: currentLead, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('data')
      .eq('id', params.id)
      .single()

    if (fetchError || !currentLead) {
      console.error('Error fetching lead:', fetchError)
      return NextResponse.json(
        { message: 'Lead not found' },
        { status: 404 }
      )
    }

    // Update only the specific key in the JSONB data
    const updatedData = {
      ...currentLead.data,
      [path]: value,
    }

    // Update the lead with the modified data
    const { data: updatedLead, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ data: updatedData })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating lead:', updateError)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      lead: updatedLead,
      message: 'Lead updated successfully',
    })
  } catch (error) {
    console.error('Error updating lead:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
