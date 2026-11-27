import { sql } from 'drizzle-orm'
import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'
import type { TPartyAction } from '@/domain/campaign/enterprise/party-action'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'

export type TPartyActionHttp = TPartyHttp & {
  combatUpdates: readonly TCombatUpdate[]
}

// D-31: colunas consultáveis + o resto do save em `state` (com `schemaVersion`).
export const parties = pgTable('parties', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  state: jsonb('state').$type<unknown>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
})

export const partyActionReceipts = pgTable(
  'party_action_receipts',
  {
    partyId: uuid('party_id')
      .notNull()
      .references(() => parties.id, { onDelete: 'cascade' }),
    key: uuid('key').notNull(),
    action: jsonb('action').$type<TPartyAction>().notNull(),
    combatUpdates: jsonb('combat_updates')
      .$type<readonly TCombatUpdate[]>()
      .notNull(),
    response: jsonb('response').$type<TPartyActionHttp>(),
  },
  (table) => [
    primaryKey({ columns: [table.partyId, table.key] }),
    uniqueIndex('party_action_receipts_pending')
      .on(table.partyId)
      .where(sql`${table.response} is null`),
  ]
)
