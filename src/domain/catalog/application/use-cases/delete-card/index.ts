import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'

export type TDeleteCardUseCaseRequest = { cardId: string }

export type TDeleteCardUseCaseResponse = Either<
  CardNotFoundError | ContentInUseError | ContentReferencedError,
  null
>

/**
 * REQ-45, REQ-39, REQ-40. Ordem: carta (404), usada por save (409
 * `CONTENT_IN_USE`), no `starterDeck` de alguma classe (409
 * `CONTENT_REFERENCED`).
 */
export class DeleteCardUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly partiesRepository: PartiesRepository
  ) {}

  async execute({
    cardId,
  }: TDeleteCardUseCaseRequest): Promise<TDeleteCardUseCaseResponse> {
    if (!(await this.contentStore.findEditorCard(cardId))) {
      return left(new CardNotFoundError())
    }

    if ((await this.partiesRepository.findContentInUse()).cardIds.has(cardId)) {
      return left(new ContentInUseError())
    }

    const classes = await this.contentStore.listEditorClasses()
    if (
      classes.some(({ classDefinition }) =>
        classDefinition.starterDeck.some((entry) => entry.cardId === cardId)
      )
    ) {
      return left(new ContentReferencedError())
    }

    await this.contentStore.deleteCard(cardId)

    return right(null)
  }
}
