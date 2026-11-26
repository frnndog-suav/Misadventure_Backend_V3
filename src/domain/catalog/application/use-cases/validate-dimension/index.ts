import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { loadAllCards } from '@/domain/catalog/application/use-cases/_shared/all-cards'
import { checkDimensionComposition } from '@/domain/catalog/enterprise/dimension-composition'
import type {
  TCard,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'

export type TValidateDimensionUseCaseRequest = { collectionId: string }

export type TValidateDimensionUseCaseResponse = Either<
  CollectionNotFoundError,
  { valid: boolean; problems: string[] }
>

/** REQ-36, REQ-47: confere só a Carta de Dimensão e as zonas publicadas. */
export class ValidateDimensionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TValidateDimensionUseCaseRequest): Promise<TValidateDimensionUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const zones: TZoneCard[] = []
    const cards: TCard[] = []
    let dimension: TDimensionCard | null = null
    for (const { status, card } of await this.contentStore.listEditorCards(
      collectionId
    )) {
      if (status !== 'published') continue
      cards.push(card)
      if (card.type === 'zone') zones.push(card)
      if (card.type === 'dimension') dimension = card
    }

    const referenceCards = dimension?.completion
      ? (await loadAllCards(this.contentStore))
          .filter(
            ({ card, status }) =>
              card.collectionId !== collectionId && status === 'published'
          )
          .map(({ card }) => card)
      : []
    const problems = checkDimensionComposition({
      dimension,
      zones,
      cards,
      referenceCards,
    })

    return right({ valid: problems.length === 0, problems })
  }
}
