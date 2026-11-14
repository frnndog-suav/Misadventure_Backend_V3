import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// D-13: uma linha (`id = 'current'`) com só as chaves ajustadas.
export const gameConfig = pgTable('game_config', {
  id: text('id').primaryKey(),
  values: jsonb('values').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
