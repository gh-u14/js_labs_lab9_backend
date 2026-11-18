import { createAppError } from '../lib/errors.js'

const LOGIN_RE = /^(?=.*[a-z])[a-z0-9._-]{3,32}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/
const PHONE_RE = /^\d{10,15}$/
const PASSWORD_HASH_RE = /^[0-9a-f]{64}$/

export type RegisterInput = {
  login: string
  email?: string
  phone?: string
  passwordHash: string
}

export type NormalizedRegister = {
  login: string
  email: string | null
  phone: string | null
  passwordHash: string
}

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase()
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function isValidLogin(login: string): boolean {
  return LOGIN_RE.test(login)
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone)
}

export function isValidPasswordHash(hash: string): boolean {
  return PASSWORD_HASH_RE.test(hash)
}

/** Reject empty strings for optional contacts; absent key stays null. */
export function normalizeRegisterBody(body: RegisterInput): NormalizedRegister {
  const login = normalizeLogin(body.login)

  let email: string | null = null
  if (body.email !== undefined) {
    if (body.email.trim() === '') {
      throw createAppError(400, 'invalid_body', 'Тело запроса не прошло проверку')
    }
    email = normalizeEmail(body.email)
  }

  let phone: string | null = null
  if (body.phone !== undefined) {
    if (body.phone.trim() === '') {
      throw createAppError(400, 'invalid_body', 'Тело запроса не прошло проверку')
    }
    phone = normalizePhone(body.phone)
  }

  return {
    login,
    email,
    phone,
    passwordHash: body.passwordHash,
  }
}

export function assertRegisterFormats(data: NormalizedRegister): void {
  if (!isValidLogin(data.login)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат логина')
  }

  if (data.email === null && data.phone === null) {
    throw createAppError(400, 'invalid_body', 'Укажите email или телефон')
  }

  if (data.email !== null && !isValidEmail(data.email)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат email')
  }

  if (data.phone !== null && !isValidPhone(data.phone)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат телефона')
  }

  if (!isValidPasswordHash(data.passwordHash)) {
    throw createAppError(400, 'invalid_body', 'Некорректный формат passwordHash')
  }
}
