import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { parseCollectionInput } from '@/domain/catalog/enterprise/collection-input'
import {
  describeCollection,
  type TEditorCollection,
} from '@/domain/catalog/enterprise/editor-collection'

export type TCreateCollectionUseCaseRequest = { body: unknown }

export type TCreateCollectionUseCaseResponse = Either<
  ContentInvalidError | ContentIdTakenError,
  { collection: TEditorCollection }
>

/** REQ-42: a validação vem antes da conferência de id usado. */
export class CreateCollectionUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    body,
  }: TCreateCollectionUseCaseRequest): Promise<TCreateCollectionUseCaseResponse> {
    const parsed = parseCollectionInput(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const collection = parsed.value
    if (await this.contentStore.findCollection(collection.id)) {
      return left(new ContentIdTakenError([{ path: 'id', reason: 'idTaken' }]))
    }

    await this.contentStore.createCollection(collection)

    return right({ collection: describeCollection(collection, []) })
  }
}
