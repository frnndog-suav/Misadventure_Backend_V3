import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { Party } from '@/domain/campaign/enterprise/entities/party'

/** Guarda cópias (não referências), para que ler devolva outro objeto, como no banco (REQ-22). */
export class InMemoryPartiesRepository implements PartiesRepository {
  public items: Party[] = []

  async create(party: Party): Promise<void> {
    if (this.items.some((item) => item.id.equals(party.id)))
      throw new Error(`Grupo duplicado: ${party.id.toString()}`)
    this.items.push(snapshot(party))
  }

  async save(party: Party): Promise<void> {
    const index = this.items.findIndex((item) => item.id.equals(party.id))
    if (index < 0) throw new Error(`Grupo inexistente: ${party.id.toString()}`)
    this.items[index] = snapshot(party)
  }

  async findById(id: string): Promise<Party | null> {
    const found = this.items.find((item) => item.id.toString() === id)
    return found ? snapshot(found) : null
  }

  async withLockedParty<T>(
    id: string,
    run: (
      party: Party | null,
      save: (party: Party) => Promise<void>
    ) => Promise<T>
  ): Promise<T> {
    return run(await this.findById(id), (party) => this.save(party))
  }

  async findAll(): Promise<Party[]> {
    return this.items.map(snapshot)
  }

  async delete(party: Party): Promise<void> {
    this.items = this.items.filter((item) => !item.id.equals(party.id))
  }

  async findContentInUse(): Promise<{
    collectionIds: ReadonlySet<string>
    cardIds: ReadonlySet<string>
    playerClasses: ReadonlySet<string>
  }> {
    const cardIds = new Set<string>()
    const collectionIds = new Set<string>()
    const playerClasses = new Set<string>()
    for (const item of this.items) {
      const inUse = item.contentInUse()
      for (const id of item.dimension.commercialCollectionIds ?? [])
        collectionIds.add(id)
      inUse.cardIds.forEach((id) => cardIds.add(id))
      inUse.playerClasses.forEach((id) => playerClasses.add(id))
    }
    return { cardIds, playerClasses, collectionIds }
  }
}

function snapshot(party: Party): Party {
  return Party.restore(
    {
      name: party.name,
      members: [...party.members],
      hostMemberId: party.hostMemberId,
      status: party.status,
      config: party.config,
      rngState: [...party.rngState] as unknown as Party['rngState'],
      dimension: structuredClone(party.dimension),
      rewardDecks: structuredClone(party.rewardDecks),
      markets: structuredClone(party.markets),
      marketPool: structuredClone(party.marketPool),
      eventDecks: structuredClone(party.eventDecks),
      eventEncounter: structuredClone(party.eventEncounter),
      ...structuredClone(party.combatSnapshot()),
      pendingReward: structuredClone(
        party.pendingRewards.find(({ source }) => source.type !== 'grandPrize')
      ),
      grandPrizeRewards: structuredClone(
        party.pendingRewards.filter(
          ({ source }) => source.type === 'grandPrize'
        )
      ),
      lastDimensionCompletion: structuredClone(party.lastDimensionCompletion),
      questRewardDelivery: structuredClone(party.questRewardDelivery),
      boosterQueue: structuredClone(party.boosterQueue),
      questAttempt: structuredClone(party.questAttempt),
      rewardSequence: party.rewardSequence,
      turnOrder: [...party.turnOrder],
      turn: party.turn,
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    },
    party.id
  )
}
