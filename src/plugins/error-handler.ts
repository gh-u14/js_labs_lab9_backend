import type { FastifyError, FastifyInstance } from 'fastify'
import type { ConflictField } from '../lib/errors.js'

type AppError = FastifyError & {
  code?: string
  statusCode?: number
  fields?: ConflictField[]
}

export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: AppError, _request, reply) => {
    if (error.validation) {
      void reply.status(400).send({
        error: {
          code: 'invalid_body',
          message: 'Тело запроса не прошло проверку',
        },
      })
      return
    }

    const statusCode = error.statusCode ?? 500

    if (statusCode < 500) {
      const body: {
        error: {
          code: string
          message: string
          fields?: ConflictField[]
        }
      } = {
        error: {
          code: error.code ?? 'invalid_body',
          message: error.message || 'Ошибка запроса',
        },
      }
      if (error.fields && error.fields.length > 0) {
        body.error.fields = error.fields
      }
      void reply.status(statusCode).send(body)
      return
    }

    fastify.log.error(error)
    void reply.status(500).send({
      error: {
        code: 'internal',
        message: 'Внутренняя ошибка сервера',
      },
    })
  })
}
