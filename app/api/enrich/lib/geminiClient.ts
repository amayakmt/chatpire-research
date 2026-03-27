// ── Model backward-compatibility map ──────────────────────────────
// Gracefully remap deprecated/removed model IDs (persisted in DB) to
// their nearest supported equivalent.
const MODEL_MIGRATION_MAP: Record<string, string> = {
  // Removed 3.0 Pro preview → 3.1 Pro
  'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
  // Removed 2.0 models → nearest 2.5 equivalent
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite-preview': 'gemini-2.5-flash-lite',
  // Old 3.1 Flash alias (if any were stored)
  'gemini-3.1-flash': 'gemini-3-flash-preview',
}

export const DEFAULT_MODEL = 'gemini-3-flash-preview'

// ── Thinking-mode budget map ──────────────────────────────────────
export type ThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH'

// ── Helpers ───────────────────────────────────────────────────────

/** Resolve a potentially-deprecated model ID to its current equivalent. */
export function resolveModel(model: string | undefined): string {
  const id = model || DEFAULT_MODEL
  return MODEL_MIGRATION_MAP[id] ?? id
}
