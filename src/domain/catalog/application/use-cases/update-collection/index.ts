import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { parseCollectionPatch } from '@/domain/catalog/enterprise/collection-input'
import {
  describeCollection,
  type TEditorCollection,
} from '@/domain/catalog/enterprise/editor-collection'

export type TUpdateCollectionUseCaseRequest = {
  collectionId: string
  body: unknown
}

export type TUpdateCollectionUseCaseResponse = Either<
  CollectionNotFoundError | ContentInvalidError,
  { collection: TEditorCollection }
>

/** REQ-42: a coleção é conferida antes do corpo (D-54). */
export class UpdateCollectionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
    body,
  }: TUpdateCollectionUseCaseRequest): Promise<TUpdateCollectionUseCaseResponse> {
    const current = await this.contentStore.findCollection(collectionId)
    if (!current) return left(new CollectionNotFoundError())

    const parsed = parseCollectionPatch(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const collection = { ...current, ...parsed.value }
    await this.contentStore.updateCollection(collection)

    return right({
      collection: describeCollection(
        collection,
        await this.contentStore.listEditorCards(collectionId)
      ),
    })
  }
}
