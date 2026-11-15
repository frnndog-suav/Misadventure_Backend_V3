import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// D-31: colunas consultáveis + o resto do save em `state` (com `schemaVersion`).
export const parties = pgTable('parties', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  state: jsonb('state').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
})
