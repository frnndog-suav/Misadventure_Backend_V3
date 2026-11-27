import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { TPublicDomainEvent } from '@/domain/campaign/enterprise/ai-turn/public-events'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'
import type { TPartyAction } from '@/domain/campaign/enterprise/party-action'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'

export type TPartySessionHttp = TPartyHttp & {
  domainEvents: readonly TPublicDomainEvent[]
}

export type TPartyActionHttp = TPartySessionHttp & {
  combatUpdates: readonly TCombatUpdate[]
}

export type TStoredPartyActionHttp = Omit<
  TPartyActionHttp,
  'revision' | 'domainEvents'
> &
  Partial<Pick<TPartyActionHttp, 'revision' | 'domainEvents'>>

// D-31: colunas consultáveis + o resto do save em `state` (com `schemaVersion`).
export const parties = pgTable('parties', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  revision: bigint('revision', { mode: 'number' }).notNull().default(1),
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
    route: text('route')
      .$type<'action' | 'session' | 'advance'>()
      .notNull()
      .default('action'),
    action: jsonb('action').$type<TPartyAction>(),
    domainEvents: jsonb('domain_events')
      .$type<readonly TPublicDomainEvent[]>()
      .notNull()
      .default([]),
    combatUpdates: jsonb('combat_updates')
      .$type<readonly TCombatUpdate[]>()
      .notNull(),
    response: jsonb('response').$type<TStoredPartyActionHttp>(),
  },
  (table) => [
    primaryKey({ columns: [table.partyId, table.route, table.key] }),
    uniqueIndex('party_action_receipts_pending')
      .on(table.partyId)
      .where(sql`${table.response} is null and ${table.route} = 'action'`),
    index('party_advance_receipts_pending')
      .on(table.partyId)
      .where(sql`${table.response} is null`),
  ]
)
