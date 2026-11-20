/** Mask email local-part for recovery via login. Domain stays intact. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) {
    return email
  }
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length <= 2) {
    return `${local}@${domain}`
  }
  const middle = '*'.repeat(local.length - 2)
  return `${local[0]}${middle}${local[local.length - 1]}@${domain}`
}

/** Mask phone for recovery via login: last 4 digits visible. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) {
    return phone
  }
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`
}
