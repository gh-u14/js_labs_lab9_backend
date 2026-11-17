import type { FastifyError, FastifyInstance } from 'fastify'

type AppError = FastifyError & {
  code?: string
  statusCode?: number
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
      void reply.status(statusCode).send({
        error: {
          code: error.code ?? 'invalid_body',
          message: error.message || 'Ошибка запроса',
        },
      })
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
