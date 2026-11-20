import type { FastifyPluginAsync } from 'fastify'
import {
  changePassword,
  confirmEmailReplace,
  confirmPhoneReplace,
  confirmSecondContact,
  deleteEmail,
  deletePhone,
  patchProfile,
  startEmailReplace,
  startPhoneReplace,
} from '../auth/profile-update.js'
import { requireSessionProfile } from '../auth/session.js'

const passwordHashSchema = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
} as const

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/profile', async (request, reply) => {
    const profile = await requireSessionProfile(request)
    return reply.status(200).send(profile)
  })

  fastify.patch(
    '/api/profile',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            login: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        firstName?: string
        lastName?: string
        login?: string
      }
      const profile = await patchProfile(request, body)
      return reply.status(200).send(profile)
    },
  )

  fastify.post(
    '/api/profile/contact/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['channel', 'code'],
          additionalProperties: false,
          properties: {
            channel: { type: 'string', enum: ['email', 'phone'] },
            code: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { channel: 'email' | 'phone'; code: string }
      const profile = await confirmSecondContact(request, body)
      return reply.status(200).send(profile)
    },
  )

  fastify.post(
    '/api/profile/email',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { email: string }
      const result = await startEmailReplace(request, body.email)
      return reply.status(200).send(result)
    },
  )

  fastify.post(
    '/api/profile/email/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { code: string }
      const profile = await confirmEmailReplace(request, body.code)
      return reply.status(200).send(profile)
    },
  )

  fastify.delete('/api/profile/email', async (request, reply) => {
    const profile = await deleteEmail(request)
    return reply.status(200).send(profile)
  })

  fastify.post(
    '/api/profile/phone',
    {
      schema: {
        body: {
          type: 'object',
          required: ['phone'],
          additionalProperties: false,
          properties: {
            phone: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { phone: string }
      const result = await startPhoneReplace(request, body.phone)
      return reply.status(200).send(result)
    },
  )

  fastify.post(
    '/api/profile/phone/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { code: string }
      const profile = await confirmPhoneReplace(request, body.code)
      return reply.status(200).send(profile)
    },
  )

  fastify.delete('/api/profile/phone', async (request, reply) => {
    const profile = await deletePhone(request)
    return reply.status(200).send(profile)
  })

  fastify.post(
    '/api/profile/password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['currentPasswordHash', 'nextPasswordHash'],
          additionalProperties: false,
          properties: {
            currentPasswordHash: passwordHashSchema,
            nextPasswordHash: passwordHashSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        currentPasswordHash: string
        nextPasswordHash: string
      }
      const profile = await changePassword(request, reply, body)
      return reply.status(200).send(profile)
    },
  )
}

export default profileRoutes
