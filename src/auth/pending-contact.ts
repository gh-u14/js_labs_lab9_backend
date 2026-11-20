import { CONTACT_CHANGE_TTL_MS } from './ttl.js'

export type ContactChannel = 'email' | 'phone'

type PendingContactChange = {
  channel: ContactChannel
  value: string
  expiresAt: number
}

const pendingByUserId = new Map<string, PendingContactChange>()

export function setPendingContactChange(
  userId: string,
  channel: ContactChannel,
  value: string,
): void {
  pendingByUserId.set(userId, {
    channel,
    value,
    expiresAt: Date.now() + CONTACT_CHANGE_TTL_MS,
  })
}

export function takePendingContactChange(
  userId: string,
  channel: ContactChannel,
): string | null {
  const pending = pendingByUserId.get(userId)
  if (!pending) {
    return null
  }
  if (pending.expiresAt <= Date.now() || pending.channel !== channel) {
    if (pending.expiresAt <= Date.now()) {
      pendingByUserId.delete(userId)
    }
    return null
  }
  pendingByUserId.delete(userId)
  return pending.value
}

export function clearPendingContactChange(userId: string): void {
  pendingByUserId.delete(userId)
}
