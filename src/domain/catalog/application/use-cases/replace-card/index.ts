import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  cardsOutside,
  loadAllCards,
  statusById,
} from '@/domain/catalog/application/use-cases/_shared/all-cards'
import { loadOtherDimensions } from '@/domain/catalog/application/use-cases/_shared/other-dimensions'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import {
  buildCard,
  breaksQuestReferences,
  citesOtherCards,
  isCitedInBlacksmith,
  isCitedInMarketStock,
  isCitedInRewardDeck,
  effectCitationPublicationIssues,
  combatDeckPublicationIssues,
  refinementPublicationIssues,
  rewardDeckPublicationIssues,
  questPublicationIssues,
  validateCandidate,
} from '@/domain/catalog/enterprise/card-validation'
import { breaksSpecializationReferences } from '@/domain/catalog/enterprise/class-validation'
import {
  isExecutableCombatEvent,
  isRewardCard,
} from '@/domain/catalog/enterprise/catalog-integrity'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TReplaceCardUseCaseRequest = { cardId: string; body: unknown }

export type TReplaceCardUseCaseResponse = Either<
  | CardNotFoundError
  | CollectionNotFoundError
  | ContentInvalidError
  | ContentLockedError
  | ContentReferencedError
  | ContentIdTakenError,
  { editorCard: TEditorCard }
>

/**
 * REQ-43, REQ-44. Ordem: carta (404), formato e regras (400), `slug` novo de
 * carta publicada (409 `CONTENT_LOCKED`), carta do `starterDeck` de classe
 * (409 `CONTENT_REFERENCED`, REQ-40), id novo já usado (409). Mantém o
 * status; rascunho com outro `slug` é renomeado. Carta citada em
 * `rewardDecks` não é renomeada nem muda para tipo fora do deck (409, D-91).
 */
export class ReplaceCardUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly cardInputParser: CardInputParser
  ) {}

  async execute({
    cardId,
    body,
  }: TReplaceCardUseCaseRequest): Promise<TReplaceCardUseCaseResponse> {
    const current = await this.contentStore.findEditorCard(cardId)
    if (!current) return left(new CardNotFoundError())

    const collectionId = current.card.collectionId
    const collection = await this.contentStore.findCollection(collectionId)
    if (!collection) return left(new CollectionNotFoundError())

    const parsed = this.cardInputParser.parse(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const card = buildCard(parsed.value, collectionId)
    const localEntries = await this.contentStore.listEditorCards(collectionId)
    const others = localEntries
      .map((entry) => entry.card)
      .filter((other) => other.id !== cardId)

    const renamed = card.id !== cardId
    // D-91: carta citada em `rewardDecks` não muda para tipo que não entra no deck.
    const leavesRewardTypes = isRewardCard(current.card) && !isRewardCard(card)
    const leavesEventTypes =
      (current.card.type === 'randomEvent' ||
        current.card.type === 'combatEvent') &&
      card.type !== 'combatEvent' &&
      (card.type !== 'randomEvent' || card.escapeThreshold === undefined)
    const losesCombatExecution =
      isExecutableCombatEvent(current.card) &&
      card.type === 'combatEvent' &&
      !isExecutableCombatEvent(card)
    // REQ-136: carta do estoque de mercado continua item com `stockPrice`.
    const leavesStock =
      current.card.type === 'item' &&
      current.card.stockPrice !== null &&
      (card.type !== 'item' || card.stockPrice === null)
    // REQ-145: material continua item material; o equipamento da receita continua equipamento.
    const leavesBlacksmithRole =
      (current.card.type === 'item' &&
        current.card.itemCategory === 'material' &&
        (card.type !== 'item' || card.itemCategory !== 'material')) ||
      (current.card.type === 'equipment' && card.type !== 'equipment')
    const allCards =
      citesOtherCards(card) ||
      leavesStock ||
      leavesBlacksmithRole ||
      leavesEventTypes ||
      losesCombatExecution ||
      current.status === 'published' ||
      renamed ||
      leavesRewardTypes
        ? await loadAllCards(this.contentStore)
        : []
    const cited = () =>
      isCitedInRewardDeck(
        allCards.map((entry) => entry.card),
        new Set([cardId])
      )
    const inMarketStock = () =>
      isCitedInMarketStock(
        allCards.map((entry) => entry.card),
        new Set([cardId])
      )
    const inBlacksmith = () =>
      isCitedInBlacksmith(
        allCards.map((entry) => entry.card),
        new Set([cardId])
      )
    const issues = [
      ...validateCandidate(
        collection,
        others,
        card,
        cardId,
        await loadOtherDimensions(this.contentStore, collectionId),
        citesOtherCards(card) ? cardsOutside(allCards, collectionId) : [],
        card.type === 'item'
          ? (await this.contentStore.listCollections()).map(({ id }) => id)
          : []
      ),
      ...(current.status === 'published'
        ? [
            ...rewardDeckPublicationIssues(card, statusById(allCards)),
            ...questPublicationIssues(card, allCards),
            ...refinementPublicationIssues(card),
            ...combatDeckPublicationIssues(
              card,
              allCards.map((entry) => entry.card)
            ),
            ...effectCitationPublicationIssues(card, [
              ...allCards
                .map((entry) => entry.card)
                .filter((other) => other.id !== cardId),
              card,
            ]),
          ]
        : []),
    ]
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    if (
      (!renamed || current.status === 'draft') &&
      breaksQuestReferences(localEntries, current, card)
    ) {
      return left(new ContentReferencedError('quest'))
    }

    if (!renamed && (leavesRewardTypes || leavesEventTypes) && cited()) {
      return left(new ContentReferencedError('rewardDeck'))
    }
    if (
      !renamed &&
      losesCombatExecution &&
      isCitedInRewardDeck(
        allCards
          .filter(({ status }) => status === 'published')
          .map((entry) => entry.card),
        new Set([cardId]),
        'event'
      )
    ) {
      return left(new ContentReferencedError('rewardDeck'))
    }
    if (!renamed && leavesStock && inMarketStock()) {
      return left(new ContentReferencedError('marketStock'))
    }
    if (!renamed && leavesBlacksmithRole && inBlacksmith()) {
      return left(new ContentReferencedError('blacksmith'))
    }

    if (renamed) {
      if (current.status === 'published') return left(new ContentLockedError())
      const classes = await this.contentStore.listEditorClasses()
      if (
        classes.some(({ classDefinition }) =>
          classDefinition.starterDeck.some((entry) => entry.cardId === cardId)
        )
      ) {
        return left(new ContentReferencedError())
      }
      if (cited()) return left(new ContentReferencedError('rewardDeck'))
      if (inMarketStock())
        return left(new ContentReferencedError('marketStock'))
      if (inBlacksmith()) return left(new ContentReferencedError('blacksmith'))
      if (await this.contentStore.findEditorCard(card.id)) {
        return left(
          new ContentIdTakenError([{ path: 'slug', reason: 'idTaken' }])
        )
      }
    }

    if (
      renamed ||
      (current.card.type === 'zone' &&
        (card.type !== 'zone' || current.card.title !== card.title))
    ) {
      const references =
        allCards.length > 0 ? allCards : await loadAllCards(this.contentStore)
      const updated = references.filter((entry) => entry.card.id !== cardId)
      updated.push({ card, status: current.status })
      if (
        breaksSpecializationReferences(
          await this.contentStore.listEditorClasses(),
          references,
          updated
        )
      ) {
        return left(new ContentReferencedError('specialization'))
      }
    }

    await this.contentStore.saveCard(
      card,
      current.status,
      renamed ? cardId : undefined
    )

    return right({ editorCard: { status: current.status, card } })
  }
}
