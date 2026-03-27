import { NextRequest } from 'next/server'

/**
 * In-memory rate limiter.
 * NOTE: Resets on server restart. For multi-instance deployments, replace with Redis.
 */
interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

// Periodically clean up expired entries to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 60_000)
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * @param key    Unique key (e.g., IP address or `${ip}:${userId}`)
 * @param limit  Max requests allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

/**
 * Extracts the client IP from common proxy headers.
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
