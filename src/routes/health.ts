import type { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`)
      return { ok: true }
    } catch {
      return reply.status(503).send({ ok: false })
    }
  })
}

export default healthRoutes
