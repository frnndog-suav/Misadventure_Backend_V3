import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import type { TEditorClassSummary } from '@/domain/catalog/enterprise/value-objects/content'

export type TListEditorClassesUseCaseRequest = { collectionId: string }

export type TListEditorClassesUseCaseResponse = Either<
  CollectionNotFoundError,
  { classes: TEditorClassSummary[] }
>

/** REQ-38: classes da coleção, de todos os status, por `playerClass` (código de caractere). */
export class ListEditorClassesUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
  }: TListEditorClassesUseCaseRequest): Promise<TListEditorClassesUseCaseResponse> {
    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const classes = (await this.contentStore.listEditorClasses())
      .filter(
        ({ classDefinition }) => classDefinition.collectionId === collectionId
      )
      .map(({ status, classDefinition }): TEditorClassSummary => ({
        playerClass: classDefinition.playerClass,
        name: classDefinition.name,
        status,
      }))
      .sort((a, b) =>
        a.playerClass < b.playerClass
          ? -1
          : a.playerClass > b.playerClass
            ? 1
            : 0
      )

    return right({ classes })
  }
}
