import type { FastifyPluginAsync } from 'fastify'
import { loginUser } from '../auth/login.js'
import { confirmRegistration, registerUser } from '../auth/register.js'
import { logoutCurrentSession } from '../auth/session.js'

const passwordHashSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
} as const

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/auth/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['login', 'passwordHash'],
          additionalProperties: false,
          properties: {
            login: { type: 'string', minLength: 1 },
            email: { type: 'string' },
            phone: { type: 'string' },
            passwordHash: passwordHashSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        login: string
        email?: string
        phone?: string
        passwordHash: string
      }
      const result = await registerUser(body)
      return reply.status(201).send(result)
    },
  )

  fastify.post(
    '/api/auth/register/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['login', 'channel', 'code'],
          additionalProperties: false,
          properties: {
            login: { type: 'string', minLength: 1 },
            channel: { type: 'string', enum: ['email', 'phone'] },
            code: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        login: string
        channel: 'email' | 'phone'
        code: string
      }
      const result = await confirmRegistration(body)
      return reply.status(200).send(result)
    },
  )

  fastify.post(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['login', 'passwordHash', 'rememberMe'],
          additionalProperties: false,
          properties: {
            login: { type: 'string', minLength: 1 },
            passwordHash: passwordHashSchema,
            rememberMe: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        login: string
        passwordHash: string
        rememberMe: boolean
      }
      const profile = await loginUser(body, request, reply)
      return reply.status(200).send(profile)
    },
  )

  fastify.post('/api/auth/logout', async (request, reply) => {
    await logoutCurrentSession(request, reply)
    return reply.status(204).send()
  })
}

export default authRoutes
