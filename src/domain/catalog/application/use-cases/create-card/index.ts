import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import {
  cardsOutside,
  loadAllCards,
} from '@/domain/catalog/application/use-cases/_shared/all-cards'
import { loadOtherDimensions } from '@/domain/catalog/application/use-cases/_shared/other-dimensions'
import { CollectionNotFoundError } from '@/domain/catalog/application/use-cases/_errors/collection-not-found-error'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import {
  buildCard,
  validateCandidate,
} from '@/domain/catalog/enterprise/card-validation'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

export type TCreateCardUseCaseRequest = {
  collectionId: string
  body: unknown
}

export type TCreateCardUseCaseResponse = Either<
  CollectionNotFoundError | ContentInvalidError | ContentIdTakenError,
  { editorCard: TEditorCard }
>

/**
 * REQ-43, REQ-44. Ordem: coleção (404), formato e regras da carta (400),
 * id já usado (409). A carta nasce como rascunho.
 */
export class CreateCardUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly cardInputParser: CardInputParser
  ) {}

  async execute({
    collectionId,
    body,
  }: TCreateCardUseCaseRequest): Promise<TCreateCardUseCaseResponse> {
    const collection = await this.contentStore.findCollection(collectionId)
    if (!collection) return left(new CollectionNotFoundError())

    const parsed = this.cardInputParser.parse(body)
    if (parsed.isLeft()) return left(new ContentInvalidError(parsed.value))

    const card = buildCard(parsed.value, collectionId)
    const others = (await this.contentStore.listEditorCards(collectionId)).map(
      (entry) => entry.card
    )

    const issues = validateCandidate(
      collection,
      others,
      card,
      undefined,
      await loadOtherDimensions(this.contentStore, collectionId),
      card.type === 'dimension'
        ? cardsOutside(await loadAllCards(this.contentStore), collectionId)
        : []
    )
    if (issues.length > 0) return left(new ContentInvalidError(issues))

    if (await this.contentStore.findEditorCard(card.id)) {
      return left(
        new ContentIdTakenError([{ path: 'slug', reason: 'idTaken' }])
      )
    }

    await this.contentStore.saveCard(card, 'draft')

    return right({ editorCard: { status: 'draft', card } })
  }
}
