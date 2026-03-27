/**
 * Recursive deep extractor to extract text from any data structure.
 * Ensures we never see [object Object] — returns readable JSON or actual text.
 *
 * @param data    - The value to extract text from.
 * @param visited - WeakSet used for cycle detection across the call stack.
 * @param depth   - Current recursion depth; returns '' when exceeding MAX_DEPTH.
 */
const MAX_DEPTH = 20

export function extractTextFromAny(
  data: unknown,
  visited: WeakSet<object> = new WeakSet(),
  depth = 0
): string {
  if (data === null || data === undefined) return ''

  // Depth guard — prevent pathologically deep structures from stalling the server
  if (depth > MAX_DEPTH) return ''

  if (Array.isArray(data)) {
    // Cycle detection for arrays (arrays are objects)
    if (visited.has(data)) return ''
    visited.add(data)
    const extracted = (data as unknown[])
      .map((item) => extractTextFromAny(item, visited, depth + 1))
      .filter(Boolean)
    return extracted.join(', ')
  }

  if (typeof data !== 'object') return String(data)

  // Cycle detection for plain objects
  if (visited.has(data as object)) return ''
  visited.add(data as object)

  const obj = data as Record<string, unknown>

  if (obj.result !== undefined && obj.result !== null) {
    if (typeof obj.result === 'string') return obj.result
    const extracted = extractTextFromAny(obj.result, visited, depth + 1)
    if (extracted) return extracted
  }

  if (obj.value !== undefined && obj.value !== null) {
    if (typeof obj.value === 'string') return obj.value
    const extracted = extractTextFromAny(obj.value, visited, depth + 1)
    if (extracted) return extracted
  }

  if (obj.text !== undefined && obj.text !== null) {
    if (typeof obj.text === 'string') return obj.text
    const extracted = extractTextFromAny(obj.text, visited, depth + 1)
    if (extracted) return extracted
  }

  if (obj.content !== undefined && obj.content !== null) {
    if (typeof obj.content === 'string') return obj.content
    const extracted = extractTextFromAny(obj.content, visited, depth + 1)
    if (extracted) return extracted
  }

  if (obj.type === 'ai_rich_text' && obj.value !== undefined) {
    return extractTextFromAny(obj.value, visited, depth + 1)
  }

  if (obj.type === 'dropcontact_result') {
    if (obj.email) return String(obj.email)
    if (obj.qualification) return String(obj.qualification)
    return ''
  }

  if (obj.type === 'dropcontact_pending') return ''

  try {
    return JSON.stringify(data)
  } catch (error) {
    return `[Unable to stringify object: ${error instanceof Error ? error.message : String(error)}]`
  }
}
