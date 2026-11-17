import Fastify from 'fastify'
import { registerErrorHandler } from './plugins/error-handler.js'
import healthRoutes from './routes/health.js'

export async function buildApp() {
  const app = Fastify({
    logger: true,
  })

  registerErrorHandler(app)
  await app.register(healthRoutes)

  return app
}
