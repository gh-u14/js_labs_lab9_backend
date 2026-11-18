export type ConflictField = 'login' | 'email' | 'phone'

export type AppHttpError = Error & {
  statusCode: number
  code: string
  fields?: ConflictField[]
}

export function createAppError(
  statusCode: number,
  code: string,
  message: string,
  fields?: ConflictField[],
): AppHttpError {
  const error = new Error(message) as AppHttpError
  error.statusCode = statusCode
  error.code = code
  if (fields && fields.length > 0) {
    error.fields = fields
  }
  return error
}
