import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'

export type TDeleteCollectionUseCaseRequest = { collectionId: string }

export type TDeleteCollectionUseCaseResponse = Either<
  CollectionNotFoundError,
  null
>

/** REQ-42. `CONTENT_IN_USE` só nasce na FEAT-06 (REQ-39, D-46). */
export class DeleteCollectionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TDeleteCollectionUseCaseRequest): Promise<TDeleteCollectionUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    await this.contentStore.deleteCollection(collectionId)

    return right(null)
  }
}
