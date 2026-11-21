import type { IdGenerator } from '@/core/ports/id-generator'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import type { Party } from '../../enterprise/entities/party'

export class ResumeLegacyKnockout {
  constructor(
    private readonly catalog: CardCatalog,
    private readonly ids: IdGenerator
  ) {}

  async execute(party: Party, at: Date): Promise<boolean> {
    if (!party.canResumeLegacyKnockout) return false

    const actor = party.members.find(({ id }) =>
      id.equals(party.turn.memberId)
    )!
    const equipped = new Set(Object.values(actor.player.equipment))
    const cards = new Map<string, TCard>()
    for (const id of equipped) {
      if (id === null) continue
      const card = await this.catalog.findCard(id)
      if (card) cards.set(id, card)
    }

    return party.resumeLegacyKnockout(at, cards, this.ids)
  }
}
