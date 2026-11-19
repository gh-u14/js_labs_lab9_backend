import type { FastifyPluginAsync } from 'fastify'
import { requireSessionProfile } from '../auth/session.js'

const profileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/profile', async (request, reply) => {
    const profile = await requireSessionProfile(request)
    return reply.status(200).send(profile)
  })
}

export default profileRoutes
