import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

export const pool = new Pool({ connectionString })
export const db = drizzle({ client: pool, schema })

const RETRY_ATTEMPTS = 10
const RETRY_DELAY_MS = 1000

export async function waitForDatabase(): Promise<void> {
  let lastError: unknown

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to connect to PostgreSQL')
}
