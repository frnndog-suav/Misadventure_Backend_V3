import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TGetEditorCardUseCaseRequest = { cardId: string }

export type TGetEditorCardUseCaseResponse = Either<
  CardNotFoundError,
  { editorCard: TEditorCard }
>

/** REQ-44: qualquer status. */
export class GetEditorCardUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    cardId,
  }: TGetEditorCardUseCaseRequest): Promise<TGetEditorCardUseCaseResponse> {
    const editorCard = await this.contentStore.findEditorCard(cardId)
    if (!editorCard) return left(new CardNotFoundError())

    return right({ editorCard })
  }
}
