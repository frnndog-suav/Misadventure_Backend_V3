import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import type { TCollectionExport } from '@/domain/catalog/enterprise/value-objects/content'

export type TExportCollectionUseCaseRequest = { collectionId: string }

export type TExportCollectionUseCaseResponse = Either<
  CollectionNotFoundError,
  { file: TCollectionExport }
>

/** REQ-48: todas as cartas, de todos os status, por id, e as classes da coleção por `playerClass`. */
export class ExportCollectionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TExportCollectionUseCaseRequest): Promise<TExportCollectionUseCaseResponse> {
    const collection = await this.contentStore.findCollection(collectionId)
    if (!collection) return left(new CollectionNotFoundError())

    const entries = await this.contentStore.listEditorCards(collectionId)

    return right({
      file: {
        formatVersion: 1,
        collection: {
          id: collection.id,
          name: collection.name,
          description: collection.description,
        },
        cards: [...entries].sort((a, b) =>
          a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0
        ),
        classes: (await this.contentStore.listEditorClasses())
          .filter(
            ({ classDefinition }) =>
              classDefinition.collectionId === collectionId
          )
          .sort((a, b) =>
            a.classDefinition.playerClass < b.classDefinition.playerClass
              ? -1
              : a.classDefinition.playerClass > b.classDefinition.playerClass
                ? 1
                : 0
          ),
      },
    })
  }
}
