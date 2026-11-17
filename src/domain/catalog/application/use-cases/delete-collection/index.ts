import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'

export type TDeleteCollectionUseCaseRequest = { collectionId: string }

export type TDeleteCollectionUseCaseResponse = Either<
  CollectionNotFoundError | ContentInUseError | ContentReferencedError,
  null
>

/**
 * REQ-42, REQ-39, REQ-40. Ordem: coleção (404), alguma carta ou classe dela
 * usada por save (409 `CONTENT_IN_USE`), alguma carta dela no `starterDeck`
 * de classe de **outra** coleção (409 `CONTENT_REFERENCED`, D-60; as classes
 * da própria coleção são apagadas junto).
 */
export class DeleteCollectionUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly partiesRepository: PartiesRepository
  ) {}

  async execute({
    collectionId,
  }: TDeleteCollectionUseCaseRequest): Promise<TDeleteCollectionUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const cardIds = new Set(
      (await this.contentStore.listEditorCards(collectionId)).map(
        ({ card }) => card.id
      )
    )
    const classes = (await this.contentStore.listEditorClasses()).map(
      ({ classDefinition }) => classDefinition
    )
    const inUse = await this.partiesRepository.findContentInUse()

    if (
      [...cardIds].some((id) => inUse.cardIds.has(id)) ||
      classes.some(
        (definition) =>
          definition.collectionId === collectionId &&
          inUse.playerClasses.has(definition.playerClass)
      )
    ) {
      return left(new ContentInUseError())
    }

    if (
      classes.some(
        (definition) =>
          definition.collectionId !== collectionId &&
          definition.starterDeck.some((entry) => cardIds.has(entry.cardId))
      )
    ) {
      return left(new ContentReferencedError())
    }

    await this.contentStore.deleteCollection(collectionId)

    return right(null)
  }
}
