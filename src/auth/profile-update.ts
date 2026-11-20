import { and, eq, ne } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createAppError } from '../lib/errors.js'
import {
  isValidEmail,
  isValidLogin,
  isValidPhone,
  normalizeEmail,
  normalizeLogin,
  normalizePhone,
} from './normalize.js'
import { hashesEqual } from './password.js'
import {
  setPendingContactChange,
  takePendingContactChange,
  type ContactChannel,
} from './pending-contact.js'
import {
  profileColumns,
  toProfile,
  type ProfileFields,
  type ProfileResponse,
} from './profile.js'
import {
  createSession,
  requireSessionUser,
  setSessionCookie,
  deleteAllSessions,
} from './session.js'
import { UNVERIFIED_TTL_MS } from './ttl.js'

const OTP_CODE = '000000'

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  )
}

async function reloadProfile(userId: string): Promise<ProfileFields> {
  const [row] = await db
    .select(profileColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!row) {
    throw createAppError(401, 'unauthorized', 'Требуется вход')
  }
  return row
}

export type PatchProfileInput = {
  firstName?: string
  lastName?: string
  login?: string
}

export async function patchProfile(
  request: FastifyRequest,
  body: PatchProfileInput,
): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)

  if (
    body.firstName === undefined &&
    body.lastName === undefined &&
    body.login === undefined
  ) {
    throw createAppError(400, 'invalid_body', 'Тело запроса не прошло проверку')
  }

  const patch: {
    firstName?: string
    lastName?: string
    login?: string
  } = {}

  if (body.firstName !== undefined) {
    patch.firstName = body.firstName
  }
  if (body.lastName !== undefined) {
    patch.lastName = body.lastName
  }
  if (body.login !== undefined) {
    const login = normalizeLogin(body.login)
    if (!isValidLogin(login)) {
      throw createAppError(400, 'invalid_body', 'Некорректный формат логина')
    }
    if (login !== user.login) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.login, login), ne(users.id, user.id)))
        .limit(1)
      if (taken) {
        throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
          'login',
        ])
      }
      patch.login = login
    }
  }

  try {
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated ?? user)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
        'login',
      ])
    }
    throw error
  }
}

export async function confirmSecondContact(
  request: FastifyRequest,
  body: { channel: ContactChannel; code: string },
): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)
  const now = new Date()

  if (body.code !== OTP_CODE) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  if (body.channel === 'email') {
    if (user.email === null || user.emailVerifiedAt !== null) {
      throw createAppError(400, 'invalid_code', 'Код не подошёл')
    }
    if (user.unverifiedExpiresAt === null || user.unverifiedExpiresAt.getTime() <= now.getTime()) {
      throw createAppError(400, 'invalid_code', 'Код не подошёл')
    }
    const [updated] = await db
      .update(users)
      .set({ emailVerifiedAt: now, unverifiedExpiresAt: null })
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated!)
  }

  if (user.phone === null || user.phoneVerifiedAt !== null) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }
  if (user.unverifiedExpiresAt === null || user.unverifiedExpiresAt.getTime() <= now.getTime()) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }
  const [updated] = await db
    .update(users)
    .set({ phoneVerifiedAt: now, unverifiedExpiresAt: null })
    .where(eq(users.id, user.id))
    .returning(profileColumns)
  return toProfile(updated!)
}

export async function startEmailReplace(
  request: FastifyRequest,
  emailRaw: string,
): Promise<{ ok: true }> {
  const { user } = await requireSessionUser(request)
  if (emailRaw.trim() === '') {
    throw createAppError(400, 'invalid_body', 'Тело запроса не прошло проверку')
  }
  const email = normalizeEmail(emailRaw)
  if (!isValidEmail(email)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат email')
  }
  setPendingContactChange(user.id, 'email', email)
  return { ok: true }
}

export async function startPhoneReplace(
  request: FastifyRequest,
  phoneRaw: string,
): Promise<{ ok: true }> {
  const { user } = await requireSessionUser(request)
  if (phoneRaw.trim() === '') {
    throw createAppError(400, 'invalid_body', 'Тело запроса не прошло проверку')
  }
  const phone = normalizePhone(phoneRaw)
  if (!isValidPhone(phone)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат телефона')
  }
  setPendingContactChange(user.id, 'phone', phone)
  return { ok: true }
}

export async function confirmEmailReplace(
  request: FastifyRequest,
  code: string,
): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)
  if (code !== OTP_CODE) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }
  const value = takePendingContactChange(user.id, 'email')
  if (!value) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, value), ne(users.id, user.id)))
    .limit(1)
  if (taken) {
    throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
      'email',
    ])
  }

  const now = new Date()
  const phoneStillUnverified = user.phone !== null && user.phoneVerifiedAt === null
  const unverifiedExpiresAt = phoneStillUnverified
    ? user.unverifiedExpiresAt ?? new Date(now.getTime() + UNVERIFIED_TTL_MS)
    : null

  try {
    const [updated] = await db
      .update(users)
      .set({
        email: value,
        emailVerifiedAt: now,
        unverifiedExpiresAt,
      })
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated!)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
        'email',
      ])
    }
    throw error
  }
}

export async function confirmPhoneReplace(
  request: FastifyRequest,
  code: string,
): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)
  if (code !== OTP_CODE) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }
  const value = takePendingContactChange(user.id, 'phone')
  if (!value) {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, value), ne(users.id, user.id)))
    .limit(1)
  if (taken) {
    throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
      'phone',
    ])
  }

  const now = new Date()
  const emailStillUnverified = user.email !== null && user.emailVerifiedAt === null
  const unverifiedExpiresAt = emailStillUnverified
    ? user.unverifiedExpiresAt ?? new Date(now.getTime() + UNVERIFIED_TTL_MS)
    : null

  try {
    const [updated] = await db
      .update(users)
      .set({
        phone: value,
        phoneVerifiedAt: now,
        unverifiedExpiresAt,
      })
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated!)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createAppError(409, 'conflict', 'Логин, почта или телефон уже заняты', [
        'phone',
      ])
    }
    throw error
  }
}

export async function deleteEmail(request: FastifyRequest): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)

  if (user.email === null) {
    throw createAppError(400, 'invalid_body', 'Email не задан')
  }

  const emailVerified = user.emailVerifiedAt !== null
  const phoneVerified = user.phone !== null && user.phoneVerifiedAt !== null

  if (!emailVerified) {
    const [updated] = await db
      .update(users)
      .set({ email: null, emailVerifiedAt: null, unverifiedExpiresAt: null })
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated!)
  }

  if (!phoneVerified) {
    throw createAppError(
      400,
      'invalid_body',
      'Нельзя удалить последний подтверждённый контакт',
    )
  }

  const [updated] = await db
    .update(users)
    .set({ email: null, emailVerifiedAt: null })
    .where(eq(users.id, user.id))
    .returning(profileColumns)
  return toProfile(updated!)
}

export async function deletePhone(request: FastifyRequest): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)

  if (user.phone === null) {
    throw createAppError(400, 'invalid_body', 'Телефон не задан')
  }

  const phoneVerified = user.phoneVerifiedAt !== null
  const emailVerified = user.email !== null && user.emailVerifiedAt !== null

  if (!phoneVerified) {
    const [updated] = await db
      .update(users)
      .set({ phone: null, phoneVerifiedAt: null, unverifiedExpiresAt: null })
      .where(eq(users.id, user.id))
      .returning(profileColumns)
    return toProfile(updated!)
  }

  if (!emailVerified) {
    throw createAppError(
      400,
      'invalid_body',
      'Нельзя удалить последний подтверждённый контакт',
    )
  }

  const [updated] = await db
    .update(users)
    .set({ phone: null, phoneVerifiedAt: null })
    .where(eq(users.id, user.id))
    .returning(profileColumns)
  return toProfile(updated!)
}

export async function changePassword(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { currentPasswordHash: string; nextPasswordHash: string },
): Promise<ProfileResponse> {
  const { user } = await requireSessionUser(request)

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (!row || !hashesEqual(row.passwordHash, body.currentPasswordHash)) {
    throw createAppError(401, 'invalid_credentials', 'Неверный текущий пароль')
  }

  await db
    .update(users)
    .set({ passwordHash: body.nextPasswordHash })
    .where(eq(users.id, user.id))

  await deleteAllSessions(user.id)
  const session = await createSession(user.id, false)
  setSessionCookie(reply, request, session.id, false)

  return toProfile(await reloadProfile(user.id))
}
