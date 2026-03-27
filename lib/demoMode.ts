/** Set `NEXT_PUBLIC_DEMO_MODE=true` on Vercel (or locally) to cap AI runs for public demos. */
export const DEMO_MODEL_ID = 'gemini-2.5-flash-lite' as const
export const DEMO_MAX_ROWS = 10

export function isDemoMode(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
}
