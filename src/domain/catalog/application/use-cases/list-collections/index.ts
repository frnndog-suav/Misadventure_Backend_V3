import { type Either, right } from '@/core/error/either'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import {
  CARD_TYPES,
  type TCardType,
} from '@/domain/catalog/enterprise/value-objects/card'

import { sortById } from '../_shared/sort-by-id'

export type TCollectionSummary = {
  id: string
  name: string
  cardCounts: Record<TCardType, number>
}

export type TListCollectionsUseCaseResponse = Either<
  never,
  { collections: TCollectionSummary[] }
>

/** REQ-12 */
export class ListCollectionsUseCase {
  constructor(private readonly cardCatalog: CardCatalog) {}

  async execute(): Promise<TListCollectionsUseCaseResponse> {
    const collections = sortById(await this.cardCatalog.listCollections())

    const summaries: TCollectionSummary[] = []
    for (const collection of collections) {
      const cardCounts = Object.fromEntries(
        CARD_TYPES.map((type) => [type, 0])
      ) as Record<TCardType, number>
      for (const card of await this.cardCatalog.listCards(collection.id)) {
        cardCounts[card.type] += 1
      }
      summaries.push({ id: collection.id, name: collection.name, cardCounts })
    }

    return right({ collections: summaries })
  }
}
