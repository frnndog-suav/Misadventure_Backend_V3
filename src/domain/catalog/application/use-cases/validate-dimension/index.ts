import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { checkDimensionComposition } from '@/domain/catalog/enterprise/dimension-composition'
import type { TZoneCard } from '@/domain/catalog/enterprise/value-objects/card'

export type TValidateDimensionUseCaseRequest = { collectionId: string }

export type TValidateDimensionUseCaseResponse = Either<
  CollectionNotFoundError,
  { valid: boolean; problems: string[] }
>

/** REQ-47: confere só as zonas publicadas. */
export class ValidateDimensionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TValidateDimensionUseCaseRequest): Promise<TValidateDimensionUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const zones: TZoneCard[] = []
    for (const { status, card } of await this.contentStore.listEditorCards(
      collectionId
    )) {
      if (status === 'published' && card.type === 'zone') zones.push(card)
    }

    const problems = checkDimensionComposition(zones)

    return right({ valid: problems.length === 0, problems })
  }
}
