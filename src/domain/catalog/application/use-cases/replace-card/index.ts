import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentLockedError } from '@/domain/catalog/application/use-cases/_errors/content-locked-error'
import {
  buildCard,
  validateCandidate,
} from '@/domain/catalog/enterprise/card-validation'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TReplaceCardUseCaseRequest = { cardId: string; body: unknown }

export type TReplaceCardUseCaseResponse = Either<
  | CardNotFoundError
  | CollectionNotFoundError
  | ContentInvalidError
  | ContentLockedError
  | ContentIdTakenError,
  { editorCard: TEditorCard }
>

/**
 * REQ-43, REQ-44. Ordem: carta (404), formato e regras (400), `slug` novo de
 * carta publicada (409 `CONTENT_LOCKED`), id novo já usado (409). Mantém o
 * status; rascunho com outro `slug` é renomeado.
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
    const others = (await this.contentStore.listEditorCards(collectionId))
      .map((entry) => entry.card)
      .filter((other) => other.id !== cardId)

    const issues = validateCandidate(collection, others, card, cardId)
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    const renamed = card.id !== cardId
    if (renamed) {
      if (current.status === 'published') return left(new ContentLockedError())
      if (await this.contentStore.findEditorCard(card.id)) {
        return left(
          new ContentIdTakenError([{ path: 'slug', reason: 'idTaken' }])
        )
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
