import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { buildApp } from './app.js'
import { db, pool, waitForDatabase } from './db/client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.join(__dirname, '..', 'drizzle')

const port = Number(process.env.API_PORT ?? process.env.PORT ?? 8000)
const host = process.env.HOST ?? '0.0.0.0'

async function main(): Promise<void> {
  await waitForDatabase()
  await migrate(db, { migrationsFolder })

  const app = await buildApp()

  const shutdown = async (signal: string) => {
    app.log.info(`Shutting down on ${signal}`)
    try {
      await app.close()
      await pool.end()
      process.exit(0)
    } catch (error) {
      app.log.error(error)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  await app.listen({ port, host })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
