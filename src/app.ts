import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { registerErrorHandler } from './plugins/error-handler.js'
import authRoutes from './routes/auth.js'
import healthRoutes from './routes/health.js'
import profileRoutes from './routes/profile.js'

export async function buildApp() {
  const app = Fastify({
    logger: true,
  })

  registerErrorHandler(app)
  await app.register(cookie)
  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(profileRoutes)

  return app
}
