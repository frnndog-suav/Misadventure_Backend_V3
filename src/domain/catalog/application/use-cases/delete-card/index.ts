import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'

export type TDeleteCardUseCaseRequest = { cardId: string }

export type TDeleteCardUseCaseResponse = Either<CardNotFoundError, null>

/** REQ-45. `CONTENT_IN_USE`/`CONTENT_REFERENCED` só a partir da FEAT-06. */
export class DeleteCardUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    cardId,
  }: TDeleteCardUseCaseRequest): Promise<TDeleteCardUseCaseResponse> {
    if (!(await this.contentStore.findEditorCard(cardId))) {
      return left(new CardNotFoundError())
    }

    await this.contentStore.deleteCard(cardId)

    return right(null)
  }
}
