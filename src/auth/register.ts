import { and, eq, or } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { createAppError, type ConflictField } from '../lib/errors.js'
import {
  assertRegisterFormats,
  normalizeLogin,
  normalizeRegisterBody,
  type RegisterInput,
} from './normalize.js'
import { isPendingExpired, UNVERIFIED_TTL_MS } from './ttl.js'

const OTP_CODE = '000000'

const CONFLICT_ORDER: ConflictField[] = ['login', 'email', 'phone']

function sortFields(fields: Set<ConflictField>): ConflictField[] {
  return CONFLICT_ORDER.filter((field) => fields.has(field))
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  )
}

function fieldFromConstraint(constraint: string | undefined): ConflictField | null {
  if (!constraint) return null
  if (constraint.includes('login')) return 'login'
  if (constraint.includes('email')) return 'email'
  if (constraint.includes('phone')) return 'phone'
  return null
}

type RegisterOutcome =
  | { kind: 'created' }
  | { kind: 'conflict'; fields: ConflictField[] }

export async function registerUser(body: RegisterInput): Promise<{ status: 'pending' }> {
  const data = normalizeRegisterBody(body)
  assertRegisterFormats(data)

  const now = new Date()

  let outcome: RegisterOutcome

  try {
    outcome = await db.transaction(async (tx) => {
      const conditions = [eq(users.login, data.login)]
      if (data.email !== null) conditions.push(eq(users.email, data.email))
      if (data.phone !== null) conditions.push(eq(users.phone, data.phone))

      const matches = await tx
        .select({
          id: users.id,
          login: users.login,
          email: users.email,
          phone: users.phone,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(or(...conditions))
        .for('update')

      const conflictFields = new Set<ConflictField>()

      for (const row of matches) {
        if (row.status === 'pending' && isPendingExpired(row.createdAt, now)) {
          await tx.delete(users).where(eq(users.id, row.id))
          continue
        }

        if (row.login === data.login) conflictFields.add('login')
        if (data.email !== null && row.email === data.email) conflictFields.add('email')
        if (data.phone !== null && row.phone === data.phone) conflictFields.add('phone')
      }

      if (conflictFields.size > 0) {
        return { kind: 'conflict', fields: sortFields(conflictFields) }
      }

      await tx.insert(users).values({
        login: data.login,
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: 'pending',
      })

      return { kind: 'created' }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint =
        typeof error === 'object' && error !== null && 'constraint' in error
          ? String((error as { constraint: unknown }).constraint)
          : undefined
      const field = fieldFromConstraint(constraint)
      throw createAppError(
        409,
        'conflict',
        'Логин, почта или телефон уже заняты',
        field ? [field] : ['login'],
      )
    }
    throw error
  }

  if (outcome.kind === 'conflict') {
    throw createAppError(
      409,
      'conflict',
      'Логин, почта или телефон уже заняты',
      outcome.fields,
    )
  }

  return { status: 'pending' }
}

export type ConfirmInput = {
  login: string
  channel: 'email' | 'phone'
  code: string
}

type ConfirmOutcome =
  | { kind: 'activated' }
  | { kind: 'missing_or_expired' }
  | { kind: 'already_active' }
  | { kind: 'invalid_code' }

export async function confirmRegistration(
  body: ConfirmInput,
): Promise<{ status: 'active' }> {
  const login = normalizeLogin(body.login)
  const now = new Date()

  const outcome = await db.transaction(async (tx): Promise<ConfirmOutcome> => {
    const [row] = await tx
      .select({
        id: users.id,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.login, login))
      .for('update')
      .limit(1)

    if (!row) {
      return { kind: 'missing_or_expired' }
    }

    if (row.status === 'active') {
      return { kind: 'already_active' }
    }

    if (row.status === 'pending' && isPendingExpired(row.createdAt, now)) {
      await tx.delete(users).where(eq(users.id, row.id))
      return { kind: 'missing_or_expired' }
    }

    if (body.channel === 'email' && row.email === null) {
      return { kind: 'invalid_code' }
    }
    if (body.channel === 'phone' && row.phone === null) {
      return { kind: 'invalid_code' }
    }

    if (body.code !== OTP_CODE) {
      return { kind: 'invalid_code' }
    }

    const hasOtherContact =
      body.channel === 'email' ? row.phone !== null : row.email !== null

    const unverifiedExpiresAt = hasOtherContact
      ? new Date(now.getTime() + UNVERIFIED_TTL_MS)
      : null

    await tx
      .update(users)
      .set({
        status: 'active',
        emailVerifiedAt: body.channel === 'email' ? now : null,
        phoneVerifiedAt: body.channel === 'phone' ? now : null,
        unverifiedExpiresAt,
      })
      .where(and(eq(users.id, row.id), eq(users.status, 'pending')))

    return { kind: 'activated' }
  })

  if (outcome.kind === 'missing_or_expired') {
    throw createAppError(400, 'invalid_code', 'Срок регистрации истёк')
  }
  if (outcome.kind === 'already_active') {
    throw createAppError(409, 'conflict', 'Учётка уже подтверждена')
  }
  if (outcome.kind === 'invalid_code') {
    throw createAppError(400, 'invalid_code', 'Код не подошёл')
  }

  return { status: 'active' }
}
