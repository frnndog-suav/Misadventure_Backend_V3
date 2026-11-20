import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  cardsOutside,
  loadAllCards,
  statusById,
} from '@/domain/catalog/application/use-cases/_shared/all-cards'
import { loadOtherDimensions } from '@/domain/catalog/application/use-cases/_shared/other-dimensions'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  effectCitationPublicationIssues,
  rewardDeckPublicationIssues,
  validateCandidate,
} from '@/domain/catalog/enterprise/card-validation'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TPublishCardUseCaseRequest = { cardId: string }

export type TPublishCardUseCaseResponse = Either<
  CardNotFoundError | CollectionNotFoundError | ContentInvalidError,
  { editorCard: TEditorCard }
>

/** REQ-45: revalida (REQ-43, D-50) e publica; já publicada = sem mudança. */
export class PublishCardUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    cardId,
  }: TPublishCardUseCaseRequest): Promise<TPublishCardUseCaseResponse> {
    const current = await this.contentStore.findEditorCard(cardId)
    if (!current) return left(new CardNotFoundError())
    if (current.status === 'published') return right({ editorCard: current })

    const { card } = current
    const collection = await this.contentStore.findCollection(card.collectionId)
    if (!collection) return left(new CollectionNotFoundError())

    const others = (await this.contentStore.listEditorCards(card.collectionId))
      .map((entry) => entry.card)
      .filter((other) => other.id !== card.id)

    const allCards = await loadAllCards(this.contentStore)
    const issues = [
      ...validateCandidate(
        collection,
        others,
        card,
        card.id,
        await loadOtherDimensions(this.contentStore, card.collectionId),
        card.type === 'dimension' || card.type === 'randomEvent'
          ? cardsOutside(allCards, card.collectionId)
          : []
      ),
      ...rewardDeckPublicationIssues(card, statusById(allCards)),
      ...effectCitationPublicationIssues(
        card,
        allCards.map((entry) => entry.card)
      ),
    ]
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    await this.contentStore.saveCard(card, 'published')

    return right({ editorCard: { status: 'published', card } })
  }
}
