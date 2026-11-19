import { timingSafeEqual } from 'node:crypto'

/** Compare two SHA-256 hex strings. Length mismatch is a normal failure. */
export function hashesEqual(stored: string, provided: string): boolean {
  if (stored.length !== provided.length) {
    return false
  }
  try {
    return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(provided, 'utf8'))
  } catch {
    return false
  }
}
