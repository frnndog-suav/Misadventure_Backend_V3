import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { validateEnv } from './src/infra/env/env'

const env = validateEnv(process.env)

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/database/drizzle/schema',
  out: './src/infra/database/drizzle/migrations',
  dbCredentials: { url: env.DATABASE_URL },
})
