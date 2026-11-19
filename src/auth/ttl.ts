export const PENDING_TTL_MS = 24 * 60 * 60 * 1000
export const UNVERIFIED_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const REMEMBER_MAX_AGE_SEC = 30 * 24 * 60 * 60

export function isPendingExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= PENDING_TTL_MS
}

export function isUnverifiedExpired(
  unverifiedExpiresAt: Date | null,
  now: Date = new Date(),
): boolean {
  return unverifiedExpiresAt !== null && unverifiedExpiresAt.getTime() <= now.getTime()
}
