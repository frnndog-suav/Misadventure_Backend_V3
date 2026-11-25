import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { loadAllCards } from '@/domain/catalog/application/use-cases/_shared/all-cards'
import {
  breaksQuestReferences,
  isCitedInBlacksmith,
  isCitedInMarketStock,
  isCitedInStable,
  isCitedInRewardDeck,
} from '@/domain/catalog/enterprise/card-validation'
import { breaksSpecializationReferences } from '@/domain/catalog/enterprise/class-validation'

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
    const current = await this.contentStore.findEditorCard(cardId)
    if (!current) {
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

    // REQ-82: citada em `rewardDecks` de alguma Carta de Dimensão.
    const allCards = await loadAllCards(this.contentStore)
    if (
      isCitedInRewardDeck(
        allCards.map(({ card }) => card),
        new Set([cardId])
      )
    ) {
      return left(new ContentReferencedError('rewardDeck'))
    }
    if (breaksQuestReferences(allCards, current)) {
      return left(new ContentReferencedError('quest'))
    }
    // REQ-136: no estoque do mercado de alguma zona.
    if (
      isCitedInMarketStock(
        allCards.map(({ card }) => card),
        new Set([cardId])
      )
    ) {
      return left(new ContentReferencedError('marketStock'))
    }
    // REQ-155: no Estábulo de alguma zona.
    if (
      isCitedInStable(
        allCards.map(({ card }) => card),
        new Set([cardId])
      )
    ) {
      return left(new ContentReferencedError('stable'))
    }
    // REQ-145: material, receita ou encantamento de outra carta.
    if (
      isCitedInBlacksmith(
        allCards.map(({ card }) => card),
        new Set([cardId])
      )
    ) {
      return left(new ContentReferencedError('blacksmith'))
    }
    if (
      breaksSpecializationReferences(
        classes,
        allCards,
        allCards.filter(({ card }) => card.id !== cardId)
      )
    ) {
      return left(new ContentReferencedError('specialization'))
    }

    await this.contentStore.deleteCard(cardId)

    return right(null)
  }
}
