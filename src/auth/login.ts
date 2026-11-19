import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createAppError } from '../lib/errors.js'
import { normalizeLogin } from './normalize.js'
import { hashesEqual } from './password.js'
import { purgeExpiredUnverifiedContact, toProfile, type ProfileResponse } from './profile.js'
import { createSession, setSessionCookie } from './session.js'
import { isPendingExpired } from './ttl.js'

export type LoginInput = {
  login: string
  passwordHash: string
  rememberMe: boolean
}

function invalidCredentials(): never {
  throw createAppError(401, 'invalid_credentials', 'Неверный логин или пароль')
}

export async function loginUser(
  body: LoginInput,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ProfileResponse> {
  const login = normalizeLogin(body.login)
  const now = new Date()

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
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.login, login))
    .limit(1)

  if (!row) {
    invalidCredentials()
  }

  if (row.status === 'pending') {
    if (isPendingExpired(row.createdAt, now)) {
      await db.delete(users).where(eq(users.id, row.id))
    }
    invalidCredentials()
  }

  if (row.status !== 'active' || !hashesEqual(row.passwordHash, body.passwordHash)) {
    invalidCredentials()
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

  const session = await createSession(row.id, body.rememberMe)
  setSessionCookie(reply, request, session.id, body.rememberMe)

  return toProfile(cleaned)
}
