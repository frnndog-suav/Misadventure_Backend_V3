import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { Party } from '@/domain/campaign/enterprise/entities/party'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { type Database, DRIZZLE } from '../../database.tokens'
import { DrizzlePartyMapper } from '../mappers/drizzle-party-mapper'
import { parties } from '../schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    const { id, ...row } = DrizzlePartyMapper.toDrizzle(party)
    const updated = await this.db
      .update(parties)
      .set(row)
      .where(eq(parties.id, id))
      .returning({ id: parties.id })
    if (updated.length === 0) throw new Error(`Grupo inexistente: ${id}`)
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
      save: (party: Party) => Promise<void>
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
      return run(
        row ? DrizzlePartyMapper.toDomain(row) : null,
        async (party) => {
          const { id: partyId, ...values } = DrizzlePartyMapper.toDrizzle(party)
          await tx.update(parties).set(values).where(eq(parties.id, partyId))
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
