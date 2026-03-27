import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables:')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing')
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Set' : '✗ Missing')
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

// Client-side Supabase client (uses anon key, subject to RLS)
// PostgreSQL/Supabase uses UTF-8 by default for all text and JSONB columns
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  // Supabase client automatically handles UTF-8 encoding for JSONB columns
  // No explicit charset configuration needed - PostgreSQL defaults to UTF-8
})

// Server-side Supabase client (uses service role key, bypasses RLS)
// Use this in API routes for admin operations
// CRITICAL: PostgreSQL/Supabase uses UTF-8 encoding by default for all columns
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
      // Supabase client automatically handles UTF-8 encoding for JSONB columns
      // PostgreSQL defaults to UTF-8, so no explicit charset configuration needed
    })
  : supabase // Fallback to regular client if service role key not set
