export interface Message {
  /** Stable key for React lists; omitted in saved API payloads */
  id?: string
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Assign stable ids for list keys / refs; preserves existing ids. */
export function ensureMessageIds(messages: Message[]): Message[] {
  return messages.map((m) => ({
    ...m,
    id: m.id && m.id.length > 0 ? m.id : crypto.randomUUID(),
  }))
}

/** Persisted config / API only use role + content. */
export function stripMessageIdsForSave(
  messages: Message[]
): Array<{ role: Message['role']; content: string }> {
  return messages.map(({ role, content }) => ({ role, content }))
}
