import { type Either, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  summarizeCollection,
  type TEditorCollectionSummary,
} from '@/domain/catalog/enterprise/editor-collection'

import { sortById } from '../_shared/sort-by-id'

export type TListEditorCollectionsUseCaseResponse = Either<
  never,
  { collections: TEditorCollectionSummary[] }
>

/** REQ-42 */
export class ListEditorCollectionsUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute(): Promise<TListEditorCollectionsUseCaseResponse> {
    const collections = sortById(await this.contentStore.listCollections())

    const summaries: TEditorCollectionSummary[] = []
    for (const collection of collections) {
      summaries.push(
        summarizeCollection(
          collection,
          await this.contentStore.listEditorCards(collection.id)
        )
      )
    }

    return right({ collections: summaries })
  }
}
