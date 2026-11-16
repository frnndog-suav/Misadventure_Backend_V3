import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { isCardType } from '@/domain/catalog/enterprise/value-objects/card'
import {
  isContentStatus,
  type TContentIssue,
  type TEditorCardSummary,
} from '@/domain/catalog/enterprise/value-objects/content'

import { normalizeText } from '../_shared/normalize-text'
import { sortById } from '../_shared/sort-by-id'

export type TListEditorCardsUseCaseRequest = {
  collectionId: string
  /** Filtros crus vindos do pedido; ausente = sem filtro. */
  type?: unknown
  status?: unknown
  q?: unknown
}

export type TListEditorCardsUseCaseResponse = Either<
  ContentInvalidError | CollectionNotFoundError,
  { cards: TEditorCardSummary[] }
>

/** REQ-46. Os filtros são conferidos antes da coleção (como D-23). */
export class ListEditorCardsUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    collectionId,
    type,
    status,
    q,
  }: TListEditorCardsUseCaseRequest): Promise<TListEditorCardsUseCaseResponse> {
    const issues: TContentIssue[] = []
    if (type !== undefined && !isCardType(type)) {
      issues.push({ path: 'type', reason: 'unknownCardType' })
    }
    if (status !== undefined && !isContentStatus(status)) {
      issues.push({ path: 'status', reason: 'unknownStatus' })
    }
    if (q !== undefined && typeof q !== 'string') {
      issues.push({ path: 'q', reason: 'repeatedParam' })
    }
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    if (!(await this.contentStore.findCollection(collectionId))) {
      return left(new CollectionNotFoundError())
    }

    const search = typeof q === 'string' ? normalizeText(q) : ''
    const summaries = (await this.contentStore.listEditorCards(collectionId))
      .map(({ status: cardStatus, card }): TEditorCardSummary => ({
        id: card.id,
        type: card.type,
        name: 'name' in card ? card.name : card.title,
        status: cardStatus,
      }))
      .filter(
        (summary) =>
          (type === undefined || summary.type === type) &&
          (status === undefined || summary.status === status) &&
          normalizeText(summary.name).includes(search)
      )

    return right({ cards: sortById(summaries) })
  }
}
