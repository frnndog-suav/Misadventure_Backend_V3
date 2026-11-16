import { type Either, left, right } from '@/core/error/either'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { CardNotFoundError } from '@/domain/catalog/application/use-cases/_errors/card-not-found-error'
import {
  buildCardId,
  slugOf,
} from '@/domain/catalog/enterprise/card-validation'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TDuplicateCardUseCaseRequest = { cardId: string }

export type TDuplicateCardUseCaseResponse = Either<
  CardNotFoundError,
  { editorCard: TEditorCard }
>

/**
 * REQ-45: rascunho igual na mesma coleção, com slug `<slug>-copia`, ou
 * `-copia-2`, `-copia-3`… (o primeiro livre). Não valida de novo: a cópia de
 * uma zona fica com título repetido até ser editada.
 */
export class DuplicateCardUseCase {
  constructor(private readonly contentStore: ContentStore) {}

  async execute({
    cardId,
  }: TDuplicateCardUseCaseRequest): Promise<TDuplicateCardUseCaseResponse> {
    const source = await this.contentStore.findEditorCard(cardId)
    if (!source) return left(new CardNotFoundError())

    const base = `${slugOf(source.card)}-copia`
    let id = buildCardId(source.card.collectionId, base)
    for (let n = 2; await this.contentStore.findEditorCard(id); n += 1) {
      id = buildCardId(source.card.collectionId, `${base}-${n}`)
    }

    const card: TCard = { ...source.card, id }
    await this.contentStore.saveCard(card, 'draft')

    return right({ editorCard: { status: 'draft', card } })
  }
}
