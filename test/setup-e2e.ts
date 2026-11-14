import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { afterAll, beforeAll } from 'vitest'

// .env.test sobrepõe .env (D-03: banco isolado por execução).
config({ path: '.env', quiet: true })
config({ path: '.env.test', override: true, quiet: true })

const baseUrl = process.env.DATABASE_URL
if (!baseUrl) {
  throw new Error(
    'DATABASE_URL ausente: crie o .env.test a partir do .env.example.'
  )
}

const schema = `e2e_${randomUUID().replaceAll('-', '_')}`

function urlWithSchema(url: string, schemaName: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set('options', `-c search_path=${schemaName}`)
  return parsed.toString()
}

async function run(sql: string): Promise<void> {
  const client = new Client({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

// O app criado no e2e lê esta URL e trabalha só dentro do schema da execução.
process.env.DATABASE_URL = urlWithSchema(baseUrl, schema)

beforeAll(async () => {
  await run(`create schema "${schema}"`)
  // A tabela de controle das migrações também fica no schema da execução.
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await migrate(drizzle(client), {
      migrationsFolder: './src/infra/database/drizzle/migrations',
      migrationsSchema: schema,
    })
  } finally {
    await client.end()
  }
})

afterAll(async () => {
  await run(`drop schema if exists "${schema}" cascade`)
})
