import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { passwordResetTokens, users } from '../db/schema.js'
import { createAppError } from '../lib/errors.js'
import { maskEmail, maskPhone } from './mask.js'
import { normalizeEmail, normalizeLogin } from './normalize.js'
import { purgeExpiredUnverifiedContact, type ProfileFields } from './profile.js'
import { deleteAllSessions } from './session.js'
import { isPendingExpired, RESET_TOKEN_TTL_MS } from './ttl.js'

const OTP_CODE = '000000'

export type RecoveryVia = 'login' | 'email' | 'phone'
export type RecoveryChannel = 'email' | 'phone'

export type RecoveryStartResponse = {
  via: RecoveryVia
  channel: RecoveryChannel
  channels: Array<{ channel: RecoveryChannel; hint: string }>
}

type RecoveryUser = ProfileFields & {
  status: 'pending' | 'active'
  createdAt: Date
}

function classifyIdentifier(raw: string): { via: RecoveryVia; lookup: string } {
  const trimmed = raw.trim()
  if (trimmed.includes('@')) {
    return { via: 'email', lookup: normalizeEmail(trimmed) }
  }
  if (/^\d+$/.test(trimmed)) {
    return { via: 'phone', lookup: trimmed }
  }
  return { via: 'login', lookup: normalizeLogin(trimmed) }
}

async function findUserByVia(
  via: RecoveryVia,
  lookup: string,
): Promise<RecoveryUser | null> {
  const where =
    via === 'email'
      ? eq(users.email, lookup)
      : via === 'phone'
        ? eq(users.phone, lookup)
        : eq(users.login, lookup)

  const [row] = await db
    .select({
      id: users.id,
      login: users.login,
      email: users.email,
      phone: users.phone,
      firstName: users.firstName,
      lastName: users.lastName,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      unverifiedExpiresAt: users.unverifiedExpiresAt,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .limit(1)

  return row ?? null
}

async function resolveActiveUser(
  identifier: string,
): Promise<{ via: RecoveryVia; user: ProfileFields; rawIdentifier: string }> {
  const rawIdentifier = identifier.trim()
  if (rawIdentifier === '') {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  const { via, lookup } = classifyIdentifier(rawIdentifier)
  const row = await findUserByVia(via, lookup)

  if (!row) {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  if (row.status === 'pending') {
    if (isPendingExpired(row.createdAt)) {
      await db.delete(users).where(eq(users.id, row.id))
    }
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  if (row.status !== 'active') {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  const cleaned = await purgeExpiredUnverifiedContact({
    id: row.id,
    login: row.login,
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    unverifiedExpiresAt: row.unverifiedExpiresAt,
  })

  if (via === 'email' && cleaned.email === null) {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }
  if (via === 'phone' && cleaned.phone === null) {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  return { via, user: cleaned, rawIdentifier }
}

function buildChannelsForLogin(user: ProfileFields): RecoveryStartResponse {
  const channels: RecoveryStartResponse['channels'] = []
  if (user.email !== null) {
    channels.push({ channel: 'email', hint: maskEmail(user.email) })
  }
  if (user.phone !== null) {
    channels.push({ channel: 'phone', hint: maskPhone(user.phone) })
  }

  if (channels.length === 0) {
    throw createAppError(404, 'user_not_found', 'Пользователь не найден')
  }

  const channel: RecoveryChannel =
    user.email !== null ? 'email' : 'phone'

  return { via: 'login', channel, channels }
}

export async function startRecovery(identifier: string): Promise<RecoveryStartResponse> {
  const { via, user, rawIdentifier } = await resolveActiveUser(identifier)

  if (via === 'login') {
    return buildChannelsForLogin(user)
  }

  if (via === 'email') {
    return {
      via: 'email',
      channel: 'email',
      channels: [{ channel: 'email', hint: rawIdentifier }],
    }
  }

  return {
    via: 'phone',
    channel: 'phone',
    channels: [{ channel: 'phone', hint: rawIdentifier }],
  }
}

function userHasChannel(user: ProfileFields, channel: RecoveryChannel): boolean {
  if (channel === 'email') {
    return user.email !== null
  }
  return user.phone !== null
}

export async function confirmRecovery(body: {
  identifier: string
  channel: RecoveryChannel
  code: string
}): Promise<{ resetToken: string }> {
  if (body.code !== OTP_CODE) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  let resolved: { user: ProfileFields }
  try {
    resolved = await resolveActiveUser(body.identifier)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'user_not_found'
    ) {
      throw createAppError(400, 'invalid_code', 'Код не подошёл')
    }
    throw error
  }

  if (!userHasChannel(resolved.user, body.channel)) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

  await db.insert(passwordResetTokens).values({
    token,
    userId: resolved.user.id,
    expiresAt,
  })

  return { resetToken: token }
}

export async function completeRecovery(body: {
  resetToken: string
  passwordHash: string
}): Promise<{ ok: true }> {
  const [row] = await db
    .select({
      token: passwordResetTokens.token,
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, body.resetToken))
    .limit(1)

  if (!row) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, row.token))
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  await db
    .update(users)
    .set({ passwordHash: body.passwordHash })
    .where(eq(users.id, row.userId))

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, row.token))
  await deleteAllSessions(row.userId)

  return { ok: true }
}
