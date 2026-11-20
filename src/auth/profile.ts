import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, type User } from '../db/schema.js'
import { isUnverifiedExpired } from './ttl.js'

export type ProfileResponse = {
  id: string
  login: string
  email: string | null
  phone: string | null
  firstName: string
  lastName: string
  emailVerified: boolean
  phoneVerified: boolean
  unverifiedExpiresAt: string | null
}

export type ProfileFields = Pick<
  User,
  | 'id'
  | 'login'
  | 'email'
  | 'phone'
  | 'firstName'
  | 'lastName'
  | 'emailVerifiedAt'
  | 'phoneVerifiedAt'
  | 'unverifiedExpiresAt'
>

export const profileColumns = {
  id: users.id,
  login: users.login,
  email: users.email,
  phone: users.phone,
  firstName: users.firstName,
  lastName: users.lastName,
  emailVerifiedAt: users.emailVerifiedAt,
  phoneVerifiedAt: users.phoneVerifiedAt,
  unverifiedExpiresAt: users.unverifiedExpiresAt,
} as const

export function toProfile(user: ProfileFields): ProfileResponse {
  return {
    id: user.id,
    login: user.login,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerifiedAt !== null,
    phoneVerified: user.phoneVerifiedAt !== null,
    unverifiedExpiresAt: user.unverifiedExpiresAt
      ? user.unverifiedExpiresAt.toISOString()
      : null,
  }
}

/** Clear expired unverified second contact. Returns updated row fields. */
export async function purgeExpiredUnverifiedContact(
  user: ProfileFields,
  now: Date = new Date(),
): Promise<ProfileFields> {
  if (!isUnverifiedExpired(user.unverifiedExpiresAt, now)) {
    return user
  }

  const patch: {
    email?: string | null
    phone?: string | null
    unverifiedExpiresAt: null
  } = { unverifiedExpiresAt: null }

  if (user.email !== null && user.emailVerifiedAt === null) {
    patch.email = null
  }
  if (user.phone !== null && user.phoneVerifiedAt === null) {
    patch.phone = null
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      login: users.login,
      email: users.email,
      phone: users.phone,
      firstName: users.firstName,
      lastName: users.lastName,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      unverifiedExpiresAt: users.unverifiedExpiresAt,
    })

  return updated ?? { ...user, email: patch.email ?? user.email, phone: patch.phone ?? user.phone, unverifiedExpiresAt: null }
}
