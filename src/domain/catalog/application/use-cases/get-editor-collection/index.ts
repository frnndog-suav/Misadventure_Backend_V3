import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import {
  describeCollection,
  type TEditorCollection,
} from '@/domain/catalog/enterprise/editor-collection'

export type TGetEditorCollectionUseCaseRequest = { collectionId: string }

export type TGetEditorCollectionUseCaseResponse = Either<
  CollectionNotFoundError,
  { collection: TEditorCollection }
>

/** REQ-42 */
export class GetEditorCollectionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TGetEditorCollectionUseCaseRequest): Promise<TGetEditorCollectionUseCaseResponse> {
    const collection = await this.contentStore.findCollection(collectionId)
    if (!collection) return left(new CollectionNotFoundError())

    return right({
      collection: describeCollection(
        collection,
        await this.contentStore.listEditorCards(collectionId)
      ),
    })
  }
}
