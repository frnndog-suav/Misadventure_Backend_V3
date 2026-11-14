import { type Either, left, right } from '@/core/error/either'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { CatalogQueryInvalidError } from '@/domain/catalog/application/use-cases/_errors/catalog-query-invalid-error'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  isCardType,
  type TCard,
} from '@/domain/catalog/enterprise/value-objects/card'

import { sortById } from '../_shared/sort-by-id'

export type TListCollectionCardsUseCaseRequest = {
  collectionId: string
  /** Filtro cru vindo do pedido; ausente = sem filtro. */
  type?: unknown
}

export type TListCollectionCardsUseCaseResponse = Either<
  CatalogQueryInvalidError | CollectionNotFoundError,
  { cards: TCard[] }
>

/** REQ-13. O filtro é conferido antes da coleção (D-23). */
export class ListCollectionCardsUseCase {
  constructor(private readonly cardCatalog: CardCatalog) {}

  async execute({
    collectionId,
    type,
  }: TListCollectionCardsUseCaseRequest): Promise<TListCollectionCardsUseCaseResponse> {
    if (type !== undefined && !isCardType(type)) {
      return left(new CatalogQueryInvalidError())
    }

    if (!(await this.cardCatalog.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const cards = await this.cardCatalog.listCards(collectionId)

    return right({
      cards: sortById(
        type === undefined ? cards : cards.filter((card) => card.type === type)
      ),
    })
  }
}
