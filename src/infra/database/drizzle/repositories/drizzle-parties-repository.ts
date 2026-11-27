import { isDeepStrictEqual } from 'node:util'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { type Database, DRIZZLE } from '../../database.tokens'
import { DrizzlePartyMapper } from '../mappers/drizzle-party-mapper'
import { parties, partyActionReceipts } from '../schema'

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TReceipt = typeof partyActionReceipts.$inferSelect
interface TLockedReceipts {
  find(route: TReceipt['route'], key: string): Promise<TReceipt | undefined>
  findPending(): Promise<TReceipt[]>
  save(receipt: Omit<TReceipt, 'partyId'>): Promise<void>
}

/** Um save = uma linha; cada gravação é um único comando, logo atômica (D-31, REQ-22). */
@Injectable()
export class DrizzlePartiesRepository implements PartiesRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly gameConfigRepository: GameConfigRepository
  ) {}

  async create(party: Party): Promise<void> {
    await this.db.insert(parties).values(DrizzlePartyMapper.toDrizzle(party))
  }

  async save(party: Party): Promise<void> {
    await this.withLockedParty(party.id.toString(), async (current, save) => {
      if (!current) throw new Error(`Grupo inexistente: ${party.id.toString()}`)
      await save(party)
    })
  }

  async findById(id: string): Promise<Party | null> {
    // A coluna é `uuid`: outro texto faria o Postgres lançar; não existe, logo `null`.
    if (!UUID.test(id)) return null
    const [row] = await this.db.select().from(parties).where(eq(parties.id, id))
    return row ? DrizzlePartyMapper.toDomain(row) : null
  }

  async withLockedParty<T>(
    id: string,
    run: (
      party: Party | null,
      save: (party: Party) => Promise<void>,
      receipts: TLockedReceipts
    ) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const [row] = UUID.test(id)
        ? await tx
            .select()
            .from(parties)
            .where(eq(parties.id, id))
            .for('update')
        : []
      const current = row ? DrizzlePartyMapper.toDomain(row) : null
      const revision = current?.revision ?? 1
      const before = current
        ? JSON.stringify(DrizzlePartyMapper.toDrizzle(current))
        : null
      const forParty = eq(partyActionReceipts.partyId, id)
      return run(
        current,
        async (party) => {
          const next = { ...DrizzlePartyMapper.toDrizzle(party), revision }
          if (
            before !== null &&
            isDeepStrictEqual(
              JSON.parse(before),
              JSON.parse(JSON.stringify(next))
            )
          ) {
            party.recordSavedRevision(revision)
            return
          }
          const newRevision = revision + 1
          if (!Number.isSafeInteger(newRevision))
            throw new Error('Revisão do save excedida')
          await tx
            .update(parties)
            .set({ ...next, revision: newRevision })
            .where(eq(parties.id, id))
          party.recordSavedRevision(newRevision)
        },
        {
          find: async (route, key) => {
            const [receipt] = await tx
              .select()
              .from(partyActionReceipts)
              .where(
                and(
                  forParty,
                  eq(partyActionReceipts.route, route),
                  eq(partyActionReceipts.key, key)
                )
              )
            return receipt
          },
          findPending: async () => {
            return tx
              .select()
              .from(partyActionReceipts)
              .where(and(forParty, isNull(partyActionReceipts.response)))
          },
          save: async ({
            key,
            route,
            action,
            domainEvents,
            combatUpdates,
            response,
          }) => {
            await tx
              .insert(partyActionReceipts)
              .values({
                partyId: id,
                key,
                route,
                action,
                domainEvents,
                combatUpdates,
                response,
              })
              .onConflictDoUpdate({
                target: [
                  partyActionReceipts.partyId,
                  partyActionReceipts.route,
                  partyActionReceipts.key,
                ],
                set: { domainEvents, combatUpdates, response },
              })
          },
        }
      )
    })
  }

  async findAll(): Promise<Party[]> {
    const rows = await this.db.select().from(parties)
    return rows.map((row) => DrizzlePartyMapper.toDomain(row))
  }

  /** REQ-39: lê todos os saves; o editor só existe em dev (II.6). */
  async findContentInUse(): Promise<{
    collectionIds: ReadonlySet<string>
    cardIds: ReadonlySet<string>
    playerClasses: ReadonlySet<string>
  }> {
    const cardIds = new Set<string>()
    const collectionIds = new Set<string>()
    const playerClasses = new Set<string>()
    const [savedParties, gameConfig] = await Promise.all([
      this.findAll(),
      this.gameConfigRepository.get(),
    ])
    for (const entry of gameConfig?.values.reserveDeck ?? []) {
      if (entry.type === 'card') cardIds.add(entry.cardId)
    }
    for (const party of savedParties) {
      const inUse = party.contentInUse()
      for (const id of party.dimension.commercialCollectionIds ?? [])
        collectionIds.add(id)
      for (const id of inUse.cardIds) cardIds.add(id)
      for (const playerClass of inUse.playerClasses)
        playerClasses.add(playerClass)
    }
    return { cardIds, playerClasses, collectionIds }
  }

  async delete(party: Party): Promise<void> {
    await this.db.delete(parties).where(eq(parties.id, party.id.toString()))
  }
}
