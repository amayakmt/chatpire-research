import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { GoogleGenAI } from '@google/genai'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { buildGeminiMessages, buildSinglePromptHistory, extractVariables, type GeminiChatTurn } from '../lib/buildMessages'
import { resolveModel, DEFAULT_MODEL, type ThinkingLevel } from '../lib/geminiClient'
import { isDemoMode, DEMO_MODEL_ID, DEMO_MAX_ROWS } from '@/lib/demoMode'

// Thinking-mode budget map (mirrors geminiClient.ts)
const THINKING_BUDGET_MAP: Record<ThinkingLevel, number> = {
  LOW: 1024,
  MEDIUM: 8192,
  HIGH: 24576,
}

// Concurrency limit for processing leads
const CONCURRENCY_LIMIT = 5

// Maximum safe limit for "all" option (safety cap)
const MAX_SAFE_LIMIT = 10000

// Maximum rows to fetch in a single query (to avoid timeouts)
// Reduced to prevent Supabase query timeouts
const MAX_SINGLE_QUERY_LIMIT = 2000

// Batch size for fetching large datasets
const FETCH_BATCH_SIZE = 1000

/**
 * Process a single lead with AI enrichment
 */
async function processLead(
  lead: any,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null,
  prompt: string | null, // For backward compatibility
  outputColumn: string,
  config: {
    model: string
    systemInstruction?: string
    temperature: number
    useWebSearch: boolean
    thinkingLevel?: ThinkingLevel
  },
  variables: string[],
  outputColumnUuid: string, // Column UUID for storing data (single source of truth)
  columns?: Array<{ id: string; name: string }> // Column mapping for variable resolution
): Promise<{ leadId: string; success: boolean; value: any; error?: string }> {
  const startTime = Date.now()
  
  // OPTIMIZATION: Skip rows that already have valid data
  // Use UUID directly - no fallback logic (server is source of truth)
  const existingValue = lead.data?.[outputColumnUuid]
  if (existingValue) {
    // Check if it's an object with a valid value
    if (typeof existingValue === 'object' && 'value' in existingValue) {
      const value = existingValue.value
      // Skip if value is valid (not empty, not ERROR, not null/undefined)
      if (value && value !== '' && value !== 'ERROR' && value !== null && value !== undefined) {
        console.log(`⏭️ Skipping lead ${lead.id} - already has valid data:`, value.substring(0, 50))
        return {
          leadId: lead.id,
          success: true,
          value: value, // Return existing value
        }
      }
    } else if (typeof existingValue === 'string') {
      // Skip if string value is valid (not empty, not ERROR)
      if (existingValue.trim() !== '' && existingValue !== 'ERROR') {
        console.log(`⏭️ Skipping lead ${lead.id} - already has valid data:`, existingValue.substring(0, 50))
        return {
          leadId: lead.id,
          success: true,
          value: existingValue, // Return existing value
        }
      }
    }
  }
  
  try {
    // Debug: Log available keys and variables
    if (lead.data && typeof lead.data === 'object') {
      const availableKeys = Object.keys(lead.data)
      console.log(`🔍 Lead ${lead.id} - Available keys:`, availableKeys)
      console.log(`🔍 Variables to replace:`, variables)
    }

    // Initialize Gemini (new @google/genai SDK)
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }

    const ai = new GoogleGenAI({ apiKey })
    
    // Resolve model name (handles deprecated 3.0 → 3.1 migration)
    const modelName = resolveModel(config.model)

    // Process messages array (new format) or single prompt (old format).
    // Both paths go through the shared builders so that variable substitution
    // AND prompt-injection protection (lead-data values are fenced as data,
    // not instructions — see buildMessages.ts) are applied consistently.
    let systemInstruction = config.systemInstruction || ''
    let chatHistory: GeminiChatTurn[]

    if (messages && Array.isArray(messages) && messages.length > 0) {
      // New format: messages array
      const built = buildGeminiMessages(messages, lead.data, columns)
      systemInstruction = built.systemInstruction
      chatHistory = built.chatHistory
      console.log(`💬 Using ${chatHistory.length} messages for chat`)
    } else if (prompt) {
      // Old format: single prompt string (backward compatibility)
      chatHistory = buildSinglePromptHistory(prompt, lead.data, columns)
      console.log(`📝 Using single prompt (backward compatibility)`)
    } else {
      throw new Error('No messages or prompt provided')
    }

    // Build generation config for @google/genai SDK
    const genConfig: Record<string, unknown> = {
      temperature: config.useWebSearch ? 1.0 : (config.temperature || 0.0),
    }

    // System instruction
    if (systemInstruction && systemInstruction.trim()) {
      genConfig.systemInstruction = systemInstruction.trim()
    }

    // Thinking mode (Gemini 3.1+)
    if (config.thinkingLevel && THINKING_BUDGET_MAP[config.thinkingLevel]) {
      genConfig.thinkingConfig = {
        thinkingBudget: THINKING_BUDGET_MAP[config.thinkingLevel],
      }
    }

    // Google Search grounding
    if (config.useWebSearch) {
      genConfig.tools = [{ googleSearch: {} }]
    }

    // Convert chat history to contents format
    const contents = chatHistory.map((turn) => ({
      role: turn.role as 'user' | 'model',
      parts: turn.parts.map((p) => ({ text: p.text })),
    }))

    // Single unified call (works for both single-turn & multi-turn)
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: genConfig,
    })

    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Extract text (new SDK: .text is a property getter, not a method)
    const aiResponseText = (response.text ?? '').trim()
    
    // Validate that we got actual text
    if (!aiResponseText || aiResponseText === '') {
      console.error('⚠️ Gemini API returned empty text response')
      throw new Error('Gemini API returned empty text response')
    }
    
    console.log(`✅ Successfully extracted text from Gemini response (${aiResponseText.length} chars):`, aiResponseText.substring(0, 100))

    // Extract comprehensive metadata from response
    const usageMetadata = (response.usageMetadata ?? {}) as Record<string, unknown>
    const totalTokenCount = (usageMetadata.totalTokenCount as number) ?? null
    const promptTokenCount = (usageMetadata.promptTokenCount as number) ?? null
    const candidatesTokenCount = (usageMetadata.candidatesTokenCount as number) ?? null
    
    // Extract thought tokens if available (Gemini 3.1+)
    const thoughtTokens = (usageMetadata.thoughtsTokenCount as number) ?? (usageMetadata.thoughtTokenCount as number) ?? null

    // Extract thinking output from candidate parts
    let thoughts: string | null = null
    if (Array.isArray(response.candidates) && response.candidates.length > 0) {
      const candidateParts = (response.candidates[0] as any)?.content?.parts ?? []
      const thoughtTexts = candidateParts
        .filter((p: any) => p.thought === true && typeof p.text === 'string')
        .map((p: any) => p.text as string)
      if (thoughtTexts.length > 0) {
        thoughts = thoughtTexts.join('\n')
      }
    }

    // Extract sources and additional metadata if Google Search was used
    let sources: Array<{ title: string; uri: string }> = []
    let confidenceScore: number | null = null
    let searchQueries: string[] = []
    let groundingChunks: any[] = []
    
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0]
      const groundingMetadata = candidate.groundingMetadata
      
      if (groundingMetadata) {
        // Extract confidence score
        if (groundingMetadata.groundingSupports && groundingMetadata.groundingSupports.length > 0) {
          const firstSupport = groundingMetadata.groundingSupports[0]
          if (firstSupport.confidenceScores && firstSupport.confidenceScores.length > 0) {
            confidenceScore = firstSupport.confidenceScores[0] || null
          }
        }
        
        // Extract search queries (can be multiple)
        if (groundingMetadata.webSearchQueries && groundingMetadata.webSearchQueries.length > 0) {
          searchQueries = groundingMetadata.webSearchQueries
        }
        
        // Extract grounding chunks (sources)
        if (groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
          groundingChunks = groundingMetadata.groundingChunks
          
          const sourcesMap = new Map<string, { title: string; uri: string }>()
          
          groundingMetadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
              // Use URI as key to avoid duplicates
              if (!sourcesMap.has(chunk.web.uri)) {
                sourcesMap.set(chunk.web.uri, {
                  title: chunk.web.title || chunk.web.uri,
                  uri: chunk.web.uri,
                })
              }
            }
          })

          sources = Array.from(sourcesMap.values())
        }
      }
    }
    
    // Log metadata for debugging
    console.log(`📊 API Response Metadata:`, {
      model: config.model,
      totalTokens: totalTokenCount,
      promptTokens: promptTokenCount,
      candidatesTokens: candidatesTokenCount,
      thoughtTokens: thoughtTokens,
      hasGrounding: !!response.candidates?.[0]?.groundingMetadata,
      searchQueriesCount: searchQueries.length,
      sourcesCount: sources.length,
      duration_ms: duration,
    })

    // Structure the output with expanded metadata
    const cellValue = {
      type: 'ai_rich_text',
      value: aiResponseText,
      metadata: {
        model: modelName,
        time_ms: duration,
        timestamp: new Date().toISOString(),
        sources: sources,
        // Token usage metadata
        tokenCount: totalTokenCount,
        promptTokenCount: promptTokenCount,
        candidatesTokenCount: candidatesTokenCount,
        thoughtTokens: thoughtTokens,
        thoughts: thoughts,
        // Grounding metadata (if web search was used)
        ...(config.useWebSearch && {
          confidenceScore: confidenceScore,
          searchQueries: searchQueries,
          groundingChunks: groundingChunks,
        }),
      },
    }

    return {
      leadId: lead.id,
      success: true,
      value: cellValue,
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    
    console.error(`Error processing lead ${lead.id}:`, error)
    
    // Even on error, store metadata about the failure
    const errorValue = {
      type: 'ai_rich_text',
      value: 'ERROR',
      metadata: {
        model: resolveModel(config.model),
        time_ms: duration,
        timestamp: new Date().toISOString(),
        sources: [],
        thoughts: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }
    
    return {
      leadId: lead.id,
      success: false,
      value: errorValue,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Process leads in batches with concurrency control
 * Updates leads in database as each batch completes for real-time UI updates
 */
async function processLeadsInBatches(
  leads: any[],
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null,
  prompt: string | null, // For backward compatibility
  outputColumn: string,
  config: {
    model: string
    systemInstruction?: string
    temperature: number
    useWebSearch: boolean
    thinkingLevel?: ThinkingLevel
  },
  variables: string[],
  outputColumnUuid: string, // Column UUID - single source of truth for data storage
  columns?: Array<{ id: string; name: string }> // Column mapping for variable resolution
): Promise<Array<{ leadId: string; success: boolean; value: any; error?: string }>> {
  const results: Array<{ leadId: string; success: boolean; value: any; error?: string }> = []
  
  // CRITICAL: Validate outputColumnUuid is a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(outputColumnUuid)) {
    throw new Error(`CRITICAL: outputColumnUuid must be a valid UUID, got: "${outputColumnUuid}"`)
  }
  
  // Process in batches with concurrency limit
  for (let i = 0; i < leads.length; i += CONCURRENCY_LIMIT) {
    const batch = leads.slice(i, i + CONCURRENCY_LIMIT)
    
    const batchPromises = batch.map((lead) =>
      processLead(lead, messages, prompt, outputColumn, config, variables, outputColumnUuid, columns)
    )
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
    
    // Update leads in database immediately after each batch completes
    // This allows the frontend to see results in real-time
    await updateBatchResults(batchResults, outputColumnUuid)
    
    // Small delay between batches to avoid rate limits
    if (i + CONCURRENCY_LIMIT < leads.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  
  return results
}

/**
 * Update a batch of leads immediately in the database
 * Uses column UUID as the storage key (single source of truth)
 */
async function updateBatchResults(
  batchResults: Array<{ leadId: string; success: boolean; value: any; error?: string }>,
  outputColumnUuid: string // Column UUID - single source of truth
): Promise<void> {
  // Fetch current lead data for the batch
  const leadIds = batchResults.map((r) => r.leadId)
  const { data: currentLeads, error: fetchError } = await supabaseAdmin
    .from('leads')
    .select('id, data')
    .in('id', leadIds)

  if (fetchError) {
    console.error('Error fetching leads for batch update:', fetchError)
    return
  }

  // Update each lead
  const updatePromises = batchResults.map(async (result) => {
    const currentLead = currentLeads?.find((l) => l.id === result.leadId)
    if (!currentLead) {
      console.error(`Lead ${result.leadId} not found`)
      return
    }

    // Store the structured value (object with type, value, and metadata)
    // If result.value is null or undefined, store an error structure
    let cellValue = result.value
    
    // Validate that result.value is the correct structure
    if (!cellValue) {
      console.error(`⚠️ Lead ${result.leadId}: No value in result, storing ERROR`)
      cellValue = {
        type: 'ai_rich_text',
        value: 'ERROR',
        metadata: {
          model: 'unknown',
          time_ms: 0,
          timestamp: new Date().toISOString(),
          sources: [],
          tokenCount: null,
          confidenceScore: null,
          searchQuery: null,
          error: result.error || 'No value returned from AI processing',
        },
      }
    } else if (typeof cellValue !== 'object' || cellValue.type !== 'ai_rich_text') {
      console.error(`⚠️ Lead ${result.leadId}: Invalid cellValue structure:`, typeof cellValue, JSON.stringify(cellValue).substring(0, 200))
      // Try to fix it if it's just a string
      if (typeof cellValue === 'string') {
        cellValue = {
          type: 'ai_rich_text',
          value: cellValue,
          metadata: {
            model: 'unknown',
            time_ms: 0,
            timestamp: new Date().toISOString(),
            sources: [],
            tokenCount: null,
            confidenceScore: null,
            searchQuery: null,
          },
        }
      } else {
        cellValue = {
          type: 'ai_rich_text',
          value: 'ERROR',
          metadata: {
            model: 'unknown',
            time_ms: 0,
            timestamp: new Date().toISOString(),
            sources: [],
            tokenCount: null,
            confidenceScore: null,
            searchQuery: null,
            error: 'Invalid value structure returned from AI processing',
          },
        }
      }
    }
    
    // Ensure the value field is a string (not an object or undefined)
    if (!cellValue.value) {
      console.error(`⚠️ Lead ${result.leadId}: cellValue.value is empty or undefined`)
      cellValue.value = 'ERROR'
    } else if (typeof cellValue.value !== 'string') {
      console.error(`⚠️ Lead ${result.leadId}: cellValue.value is not a string:`, typeof cellValue.value, JSON.stringify(cellValue.value).substring(0, 200))
      cellValue.value = String(cellValue.value)
    }

    // CRITICAL: Use UUID as storage key - single source of truth
    // No validation needed - UUID is guaranteed to be valid format
    const updatedData = {
      ...currentLead.data,
      [outputColumnUuid]: cellValue, // Store using column UUID
    }

    console.log(`💾 Updating lead ${result.leadId} with column UUID "${outputColumnUuid}":`, {
      valueType: typeof cellValue.value,
      valueLength: cellValue.value?.length || 0,
      valuePreview: cellValue.value?.substring(0, 50) || 'empty',
      success: result.success,
      columnUuid: outputColumnUuid,
    })

    // CRITICAL: Only update the data column, NOT row_order, created_at, or updated_at
    // This prevents rows from jumping around when data is updated
    // The database will automatically update updated_at, but we don't want to change sort order
    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ data: updatedData })
      .eq('id', result.leadId)

    if (updateError) {
      console.error(`❌ Error updating lead ${result.leadId}:`, updateError)
    } else {
      console.log(`✅ Successfully updated lead ${result.leadId} with AI result`)
    }
  })

  await Promise.all(updatePromises)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  // One AI run issues many sequential POSTs (small batches for serverless timeouts).
  // 10/min capped every board at ~50 rows; use a higher budget so large runs work.
  if (!checkRateLimit(ip, 400, 60_000)) {
    return NextResponse.json(
      { message: 'Too many enrichment requests. Wait a minute and try again.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { boardId, columnId, rowIds, limit, config: overrideConfig, excludeProcessed = true } = body

    // Validation
    if (!boardId || typeof boardId !== 'string') {
      return NextResponse.json(
        { message: 'boardId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!columnId || typeof columnId !== 'string') {
      return NextResponse.json(
        { message: 'columnId is required and must be a string' },
        { status: 400 }
      )
    }

    // VIEW-AWARE EXECUTION: Validate rowIds if provided
    if (rowIds !== undefined) {
      if (!Array.isArray(rowIds) || rowIds.length === 0) {
        return NextResponse.json(
          { message: 'rowIds must be a non-empty array of UUIDs' },
          { status: 400 }
        )
      }
      // Validate all rowIds are strings (UUIDs)
      if (!rowIds.every((id) => typeof id === 'string' && id.length > 0)) {
        return NextResponse.json(
          { message: 'All rowIds must be valid UUID strings' },
          { status: 400 }
        )
      }
    }

    // Fetch the column configuration from board_columns
    const { data: column, error: columnError } = await supabaseAdmin
      .from('board_columns')
      .select('*')
      .eq('id', columnId)
      .eq('board_id', boardId)
      .single()

    if (columnError || !column) {
      return NextResponse.json(
        { message: 'Column not found or does not belong to this board' },
        { status: 404 }
      )
    }

    if (column.type !== 'ai_enrichment') {
      return NextResponse.json(
        { message: 'Column is not an AI enrichment column' },
        { status: 400 }
      )
    }

    // CRITICAL: Fetch all columns for the board to enable name-to-UUID mapping for variables
    // This allows {{fullName}} to map to the correct UUID-based data key
    const { data: allColumns, error: columnsError } = await supabaseAdmin
      .from('board_columns')
      .select('id, name')
      .eq('board_id', boardId)

    if (columnsError) {
      console.warn('⚠️ Failed to fetch all columns for variable mapping:', columnsError)
      // Continue without column mapping (will use fallback logic)
    }

    const columns = allColumns || []
    console.log(`📋 Fetched ${columns.length} columns for variable mapping:`, 
      columns.map((col: any) => ({ name: col.name, id: col.id }))
    )

    // Extract saved configuration from column.config
    const savedConfig = column.config || {}
    let outputColumn = column.name
    
    // CRITICAL: Validate and fix column name if it contains variable syntax
    // This can happen if a column was accidentally created with a variable name
    // We MUST use the actual column name, NOT a variable name from the prompt
    if (outputColumn && (outputColumn.includes('{{') || outputColumn.includes('}}'))) {
      console.error(`⚠️ CRITICAL: Column name contains variable syntax: "${outputColumn}"`)
      console.error(`⚠️ This column was likely created incorrectly. Column ID: ${column.id}`)
      // Try to extract a clean name, or use a default based on column ID
      const cleanName = outputColumn.replace(/\{\{|\}\}/g, '').trim() || `AI Column ${column.id.substring(0, 8)}`
      console.error(`⚠️ Attempting to use cleaned name: "${cleanName}"`)
      // Update the column name in the database to fix it permanently
      const { error: updateError } = await supabaseAdmin
        .from('board_columns')
        .update({ name: cleanName })
        .eq('id', column.id)
      
      if (updateError) {
        console.error(`❌ Failed to fix column name:`, updateError)
        // Fallback: use a safe name based on column ID
        outputColumn = `ai_column_${column.id.substring(0, 8)}`
        console.error(`⚠️ Using fallback column name: "${outputColumn}"`)
      } else {
        outputColumn = cleanName
        console.log(`✅ Fixed column name from "${column.name}" to "${cleanName}"`)
      }
    }
    
    // CRITICAL: Use column UUID as storage key - single source of truth
    // Column name is display-only, UUID is permanent identifier
    // This ensures data survives column renames (Pragmatic Programmer: Single Source of Truth)
    const outputColumnUuid = column.id
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(outputColumnUuid)) {
      return NextResponse.json(
        { message: `Invalid column UUID format: ${outputColumnUuid}` },
        { status: 400 }
      )
    }
    
    // Log the column info for debugging
    console.log(`📌 Column Info:`, {
      columnUuid: column.id,
      columnName: column.name,
      columnType: column.type,
      storageKey: outputColumnUuid, // UUID is the storage key
    })

    // Backward compatibility: Support both old format (prompt string) and new format (messages array)
    let prompt = ''
    let systemInstruction = ''
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null = null

    if (savedConfig.messages && Array.isArray(savedConfig.messages)) {
      // New format: messages array
      messages = savedConfig.messages
      // Extract system messages and user messages
      const systemMessages = (messages || []).filter(m => m.role === 'system').map(m => m.content)
      const userMessages = (messages || []).filter(m => m.role === 'user').map(m => m.content)
      
      systemInstruction = systemMessages.join('\n\n')
      // For now, use the last user message as the prompt (backward compatibility)
      // TODO: Update to use full chat history with chat API
      prompt = userMessages[userMessages.length - 1] || ''
    } else if (savedConfig.prompt) {
      // Old format: single prompt string
      prompt = savedConfig.prompt
      systemInstruction = savedConfig.systemInstruction || ''
    }

    // Validate that we have either messages or prompt
    const hasMessages = messages && Array.isArray(messages) && messages.length > 0 && messages.some(m => m.content.trim())
    const hasPrompt = prompt && typeof prompt === 'string' && prompt.trim()
    
    if (!hasMessages && !hasPrompt) {
      return NextResponse.json(
        { message: 'Column configuration is missing a prompt or messages. Please configure the column first.' },
        { status: 400 }
      )
    }

    // Merge saved config with override config (override takes precedence)
    const config = {
      model: overrideConfig?.model || savedConfig.model || DEFAULT_MODEL,
      systemInstruction: overrideConfig?.systemInstruction || systemInstruction || '',
      temperature: overrideConfig?.temperature !== undefined ? overrideConfig.temperature : (savedConfig.temperature !== undefined ? savedConfig.temperature : 0.0),
      useWebSearch: overrideConfig?.useWebSearch !== undefined ? overrideConfig.useWebSearch : (savedConfig.useWebSearch !== undefined ? savedConfig.useWebSearch : false),
      thinkingLevel: overrideConfig?.thinkingLevel || savedConfig.thinkingLevel || undefined,
      messages: messages, // Pass messages for future chat API support
    }

    if (isDemoMode()) {
      config.model = resolveModel(DEMO_MODEL_ID)
      config.thinkingLevel = undefined
      console.log('🎭 DEMO_MODE: Forcing model to Gemini 2.5 Flash Lite; thinking disabled')
    }

    // Check for Gemini API key
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { message: 'GEMINI_API_KEY environment variable is not set' },
        { status: 500 }
      )
    }

    // Extract variables from messages or prompt
    let variables: string[] = []
    if (messages && Array.isArray(messages)) {
      // Extract from all messages
      const allText = messages.map(m => m.content).join(' ')
      variables = extractVariables(allText)
      console.log(`💬 Using ${messages.length} messages from column "${column.name}"`)
      console.log(`📝 Extracted variables: ${variables.join(', ')}`)
    } else if (prompt) {
      variables = extractVariables(prompt)
      console.log(`📝 Using saved prompt from column "${column.name}": ${prompt.substring(0, 100)}...`)
      console.log(`📝 Extracted variables: ${variables.join(', ')}`)
    }

    // VIEW-AWARE EXECUTION: Fetch specific rows by ID (respects frontend sort order)
    let leads: any[] = []
    
    if (rowIds && Array.isArray(rowIds) && rowIds.length > 0) {
      // Fetch only the specific rows requested by the frontend (in the order they appear in the view)
      console.log(`📋 VIEW-AWARE: Fetching ${rowIds.length} specific rows in view order`)
      const { data: fetchedLeads, error: leadsError } = await supabaseAdmin
        .from('leads')
        .select('id, data')
        .eq('board_id', boardId)
        .in('id', rowIds)
      
      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
        return NextResponse.json(
          { message: 'Internal server error' },
          { status: 500 }
        )
      }
      
      // FRONTEND-DRIVEN: When rowIds are provided, the frontend has already calculated pending rows
      // Just process the exact IDs sent - no additional filtering needed
      // Preserve the order from rowIds (frontend view order)
      const leadMap = new Map(fetchedLeads?.map((lead) => [lead.id, lead]) || [])
      leads = rowIds.map((id) => leadMap.get(id)).filter((lead) => lead !== undefined)
      
      if (leads.length === 0) {
        return NextResponse.json(
          { message: 'No rows found for the provided IDs.' },
          { status: 404 }
        )
      }
      
      if (leads.length !== rowIds.length) {
        console.warn(`⚠️ Only found ${leads.length} of ${rowIds.length} requested rows`)
      }
      
      console.log(`✅ FRONTEND-DRIVEN: Processing exactly ${leads.length} rows as calculated by frontend`)
    } else {
      // Limit-based query: Filter at database level BEFORE applying limit
      let queryLimit: number | undefined
      if (limit === 'all') {
        // For "all", use a reasonable cap to avoid timeouts
        queryLimit = Math.min(MAX_SAFE_LIMIT, MAX_SINGLE_QUERY_LIMIT)
        console.log(`⚠️ "All rows" selected, applying safety cap of ${queryLimit} rows to avoid timeouts`)
      } else if (typeof limit === 'number' && limit > 0) {
        queryLimit = limit
      } else {
        queryLimit = 10
      }
      
      // STRATEGY: For large queries, fetch in smaller batches to avoid timeouts
      // Simplify query by removing complex ordering for initial fetch, then sort in memory if needed
      const bufferMultiplier = excludeProcessed 
        ? (queryLimit > 1000 ? 1.2 : 2) // Even smaller buffer for very large queries
        : 1
      const targetFetchCount = Math.ceil(queryLimit * bufferMultiplier)
      
      console.log(`📋 Target fetch: ${targetFetchCount} rows (${queryLimit} requested) with buffer multiplier ${bufferMultiplier} for excludeProcessed=${excludeProcessed}`)
      console.log(`🔍 Column UUID for filtering: "${outputColumnUuid}"`)
      
      // Fetch in smaller batches to avoid timeouts
      let fetchedLeads: any[] = []
      let offset = 0
      const batchSize = 500 // Smaller batches to avoid timeouts
      
      try {
        while (fetchedLeads.length < targetFetchCount) {
          const remaining = targetFetchCount - fetchedLeads.length
          const currentBatchSize = Math.min(batchSize, remaining)
          
          console.log(`📦 Fetching batch: offset=${offset}, limit=${currentBatchSize} (total fetched: ${fetchedLeads.length})`)
          
          // Simplified query - fetch with minimal ordering to reduce query complexity
          // We'll sort in memory if needed, but for large datasets, this is faster
          const { data: batchData, error: batchError } = await supabaseAdmin
            .from('leads')
            .select('id, data, row_order, created_at')
            .eq('board_id', boardId)
            .order('id', { ascending: true }) // Simple ordering by ID for stability
            .range(offset, offset + currentBatchSize - 1)
          
          if (batchError) {
            console.error(`❌ Error fetching batch at offset ${offset}:`, {
              message: batchError.message,
              code: batchError.code,
              details: batchError.details,
              hint: batchError.hint,
            })
            
            // If we have some data, continue with what we have
            if (fetchedLeads.length > 0) {
              console.log(`⚠️ Batch fetch error, but continuing with ${fetchedLeads.length} rows already fetched`)
              break
            }
            
            // Return sanitized error for client
            return NextResponse.json(
              { message: 'Internal server error' },
              { status: 500 }
            )
          }
          
          if (!batchData || batchData.length === 0) {
            // No more rows to fetch
            console.log(`✅ Reached end of data at offset ${offset}`)
            break
          }
          
          fetchedLeads.push(...batchData)
          offset += batchData.length
          
          // If we got fewer rows than requested, we've reached the end
          if (batchData.length < currentBatchSize) {
            console.log(`✅ Reached end of data (got ${batchData.length} rows, expected ${currentBatchSize})`)
            break
          }
          
          // Small delay between batches to avoid overwhelming the database
          if (fetchedLeads.length < targetFetchCount) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      } catch (error) {
        console.error('❌ Unexpected error during batch fetching:', error)
        // If we have some data, continue with what we have
        if (fetchedLeads.length > 0) {
          console.log(`⚠️ Unexpected error, but continuing with ${fetchedLeads.length} rows already fetched`)
        } else {
          return NextResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        }
      }
      
      // Sort in memory to match the expected order
      fetchedLeads.sort((a, b) => {
        // Sort by row_order first (nulls last)
        if (a.row_order !== null && b.row_order !== null) {
          if (a.row_order !== b.row_order) return a.row_order - b.row_order
        } else if (a.row_order !== null) return -1
        else if (b.row_order !== null) return 1
        
        // Then by created_at (nulls last)
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime()
          const dateB = new Date(b.created_at).getTime()
          if (dateA !== dateB) return dateA - dateB
        } else if (a.created_at) return -1
        else if (b.created_at) return 1
        
        // Finally by id
        return a.id.localeCompare(b.id)
      })
      
      const totalFetched = fetchedLeads.length
      console.log(`✅ Fetched ${totalFetched} total rows from database (in ${Math.ceil(totalFetched / batchSize)} batches)`)
      
      // VERBOSE LOGGING: Log candidate rows before filtering
      if (totalFetched > 0 && excludeProcessed) {
        const candidateRows = fetchedLeads.slice(0, Math.min(5, totalFetched)).map((r: any) => ({
          id: r.id,
          hasColumnKey: r.data && outputColumnUuid in r.data,
          columnValue: r.data?.[outputColumnUuid],
          columnValueType: typeof r.data?.[outputColumnUuid],
          columnValueKeys: typeof r.data?.[outputColumnUuid] === 'object' && r.data?.[outputColumnUuid] !== null 
            ? Object.keys(r.data[outputColumnUuid]) 
            : null,
          columnValueStringified: JSON.stringify(r.data?.[outputColumnUuid]).substring(0, 100),
        }))
        console.log(`🔍 Candidate Rows (first ${candidateRows.length}):`, JSON.stringify(candidateRows, null, 2))
      }

      // ROBUST JAVASCRIPT FILTER: Catch ALL empty states
      if (excludeProcessed) {
        const isPending = (row: any): boolean => {
          const val = row.data?.[outputColumnUuid]
          
          // Case 1: Undefined, Null, or missing key
          if (val === undefined || val === null) return true
          
          // Case 2: Empty string
          if (val === '') return true
          
          // Case 3: Empty object {}
          if (typeof val === 'object' && Object.keys(val).length === 0) return true
          
          // Case 4: Object with empty/failed value (e.g., { type: 'ai', value: '' })
          if (typeof val === 'object' && 'value' in val) {
            const value = val.value
            return !value || value === '' || value === 'ERROR' || value === null || value === undefined
          }
          
          // Case 5: String that's empty or ERROR
          if (typeof val === 'string') {
            return val.trim() === '' || val === 'ERROR'
          }
          
          // Case 6: Any other falsy value
          if (!val) return true
          
          return false
        }
        
        const beforeFilter = fetchedLeads?.length || 0
        let filteredLeads = (fetchedLeads || []).filter(isPending)
        const afterFilter = filteredLeads.length
        
        console.log(`🔍 JS FILTER: Filtered ${beforeFilter} rows → ${afterFilter} pending rows (excluded ${beforeFilter - afterFilter} already processed)`)
        
        // For large queries, if we don't have enough pending rows after filtering,
        // we'll process what we have rather than trying to fetch more (which could timeout)
        if (filteredLeads.length < queryLimit && totalFetched >= targetFetchCount) {
          console.log(`⚠️ Large query: Found ${filteredLeads.length} pending rows out of ${queryLimit} requested. Processing available rows to avoid timeout.`)
          // Process what we have instead of failing
        } else if (filteredLeads.length < queryLimit && totalFetched < targetFetchCount) {
          console.log(`⚠️ Only found ${filteredLeads.length} pending rows out of ${queryLimit} requested. This may indicate most rows are already processed.`)
        }
        
        // Take only the requested amount, or all available if we hit the query limit
        leads = filteredLeads.slice(0, queryLimit)
      } else {
        leads = (fetchedLeads || []).slice(0, queryLimit)
      }
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { message: 'No leads found for this board' },
        { status: 404 }
      )
    }

    // FILTER: Exclude already processed rows if excludeProcessed is true
    let leadsToProcess: any[] = leads || []
    
    if (excludeProcessed && leadsToProcess.length > 0) {
      const beforeFilter = leadsToProcess.length
      leadsToProcess = leadsToProcess.filter((lead) => {
        const columnValue = lead.data?.[outputColumnUuid]
        
        // Check if empty: null, undefined, empty string, or ERROR
        if (!columnValue) return true
        
        // Check if it's an object with empty/failed value
        if (typeof columnValue === 'object' && 'value' in columnValue) {
          const value = columnValue.value
          return !value || value === '' || value === 'ERROR' || value === null || value === undefined
        }
        
        // Check if it's a string that's empty or ERROR
        if (typeof columnValue === 'string') {
          return columnValue.trim() === '' || columnValue === 'ERROR'
        }
        
        return false
      })
      
      const afterFilter = leadsToProcess.length
      if (beforeFilter !== afterFilter) {
        console.log(`🔍 FILTERED: Excluded ${beforeFilter - afterFilter} already processed rows. Processing ${afterFilter} pending rows.`)
      }
    }
    
    if (leadsToProcess.length === 0) {
      return NextResponse.json(
        { message: 'No rows to process. All selected rows already have data.' },
        { status: 200 }
      )
    }

    if (isDemoMode() && leadsToProcess.length > DEMO_MAX_ROWS) {
      leadsToProcess = leadsToProcess.slice(0, DEMO_MAX_ROWS)
      console.log(`🎭 DEMO_MODE: Capped rows to ${DEMO_MAX_ROWS}`)
    }
    
    console.log(`🚀 Processing exactly ${leadsToProcess.length} leads (VIEW-AWARE: ${rowIds ? `${rowIds.length} specific rows` : 'limit-based'}, EXCLUDE_PROCESSED: ${excludeProcessed}) with concurrency limit of ${CONCURRENCY_LIMIT}`)

    // Process leads with AI (updates happen incrementally as batches complete)
    // IMPORTANT: Only process exactly the requested number of rows
    const results = await processLeadsInBatches(
      leadsToProcess,
      messages,
      prompt || null,
      outputColumn,
      config || {
        model: DEFAULT_MODEL,
        temperature: 0.0,
        useWebSearch: false,
      },
      variables,
      outputColumnUuid, // Pass column UUID for storage
      columns // Pass column mapping for variable resolution
    )

    // All leads have already been updated incrementally during processing
    // This is just for final stats
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.filter((r) => !r.success).length
    const updated = results.length

    console.log(`✅ Enrichment complete: ${successCount} succeeded, ${failureCount} failed, ${updated} updated in DB`)

    return NextResponse.json({
      message: 'Enrichment job completed',
      jobId: `enrich-${Date.now()}`,
      stats: {
        total: leads.length,
        successful: successCount,
        failed: failureCount,
        updated,
      },
    })
  } catch (error) {
    console.error('Error in enrichment endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}
