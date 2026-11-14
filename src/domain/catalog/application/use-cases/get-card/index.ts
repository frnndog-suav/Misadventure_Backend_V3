import { type Either, left, right } from '@/core/error/either'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'

export type TGetCardUseCaseRequest = { cardId: string }

export type TGetCardUseCaseResponse = Either<CardNotFoundError, { card: TCard }>

/** REQ-14 */
export class GetCardUseCase {
  constructor(private readonly cardCatalog: CardCatalog) {}

  async execute({
    cardId,
  }: TGetCardUseCaseRequest): Promise<TGetCardUseCaseResponse> {
    const card = await this.cardCatalog.findCard(cardId)

    return card ? right({ card }) : left(new CardNotFoundError())
  }
}
