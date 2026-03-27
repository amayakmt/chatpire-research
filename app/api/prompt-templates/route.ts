import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

/**
 * GET /api/prompt-templates
 * Fetch all prompt templates, ordered by newest first
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const { data: templates, error } = await supabaseAdmin
      .from('prompt_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching prompt templates:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ templates: templates || [] })
  } catch (error) {
    console.error('Error in GET /api/prompt-templates:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/prompt-templates
 * Create a new prompt template
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { name, content, tags, is_favorite } = body

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { message: 'Template name is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { message: 'Template content is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // Insert new template
    const { data: template, error } = await supabaseAdmin
      .from('prompt_templates')
      .insert({
        name: name.trim(),
        content: content.trim(),
        tags: tags || [],
        is_favorite: is_favorite || false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating prompt template:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/prompt-templates:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/prompt-templates
 * Update a prompt template (rename)
 */
export async function PATCH(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { id, name } = body

    // Validate required fields
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { message: 'Template id is required and must be a string' },
        { status: 400 }
      )
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { message: 'Template name is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // Update template
    const { data: template, error } = await supabaseAdmin
      .from('prompt_templates')
      .update({
        name: name.trim(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating prompt template:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    if (!template) {
      return NextResponse.json(
        { message: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error in PATCH /api/prompt-templates:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/prompt-templates
 * Delete a prompt template
 */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request)
  if (!checkRateLimit(ip, 100, 60_000)) {
    return NextResponse.json({ message: 'Too many requests' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { id } = body

    // Validate required fields
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { message: 'Template id is required and must be a string' },
        { status: 400 }
      )
    }

    // Delete template
    const { error } = await supabaseAdmin
      .from('prompt_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting prompt template:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/prompt-templates:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
