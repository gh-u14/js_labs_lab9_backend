import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { createAppError } from '../lib/errors.js'
import {
  purgeExpiredUnverifiedContact,
  toProfile,
  type ProfileFields,
  type ProfileResponse,
} from './profile.js'
import { REMEMBER_MAX_AGE_SEC, REMEMBER_TTL_MS, SESSION_TTL_MS } from './ttl.js'

export const SID_COOKIE = 'sid'

export type SessionUser = {
  sessionId: string
  user: ProfileFields
}

function newSessionId(): string {
  return randomBytes(32).toString('hex')
}

export function setSessionCookie(
  reply: FastifyReply,
  request: FastifyRequest,
  sessionId: string,
  rememberMe: boolean,
): void {
  const secure = request.protocol === 'https'
  reply.setCookie(SID_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    ...(rememberMe ? { maxAge: REMEMBER_MAX_AGE_SEC } : {}),
  })
}

export function clearSessionCookie(reply: FastifyReply, request: FastifyRequest): void {
  const secure = request.protocol === 'https'
  reply.clearCookie(SID_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  })
}

export async function createSession(
  userId: string,
  rememberMe: boolean,
): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId()
  const now = Date.now()
  const expiresAt = new Date(now + (rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS))

  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
  })

  return { id, expiresAt }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id })
  return deleted.length > 0
}

export async function deleteAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

type SessionUserRow = {
  sessionId: string
  expiresAt: Date
  userId: string
  login: string
  email: string | null
  phone: string | null
  firstName: string
  lastName: string
  emailVerifiedAt: Date | null
  phoneVerifiedAt: Date | null
  unverifiedExpiresAt: Date | null
  status: 'pending' | 'active'
}

async function loadSessionUser(sessionId: string): Promise<SessionUserRow | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      login: users.login,
      email: users.email,
      phone: users.phone,
      firstName: users.firstName,
      lastName: users.lastName,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      unverifiedExpiresAt: users.unverifiedExpiresAt,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  return row ?? null
}

/** Live session + user after lazy contact purge. Throws 401 otherwise. */
export async function requireSessionUser(request: FastifyRequest): Promise<SessionUser> {
  const sessionId = request.cookies[SID_COOKIE]
  if (!sessionId) {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }

  const row = await loadSessionUser(sessionId)
  if (!row) {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }

  if (row.status !== 'active') {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }

  const cleaned = await purgeExpiredUnverifiedContact({
    id: row.userId,
    login: row.login,
    email: row.email,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    unverifiedExpiresAt: row.unverifiedExpiresAt,
  })

  return { sessionId, user: cleaned }
}

export async function requireSessionProfile(request: FastifyRequest): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)
  return toProfile(user)
}

export async function logoutCurrentSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = request.cookies[SID_COOKIE]
  if (!sessionId) {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }

  const deleted = await deleteSession(sessionId)
  clearSessionCookie(reply, request)

  if (!deleted) {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }
}
