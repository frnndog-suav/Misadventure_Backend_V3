import { type Either, left, right } from '@/core/error/either'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import {
  buildCard,
  sortByCardId,
  toContentPath,
} from '@/domain/catalog/enterprise/card-validation'
import { parseCollectionInput } from '@/domain/catalog/enterprise/collection-input'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  isContentStatus,
  isRecord,
  SLUG_PATTERN,
  type TCollectionInput,
  type TContentIssue,
  type TContentStatus,
  type TEditorCard,
} from '@/domain/catalog/enterprise/value-objects/content'

export type TImportCollectionUseCaseRequest = {
  /** Arquivo cru (`CollectionExport`). */
  body: unknown
  /** Parâmetro `replace` cru: ausente, `'true'` ou `'false'`. */
  replace?: unknown
}

export type TImportCollectionUseCaseResponse = Either<
  ContentInvalidError | ContentIdTakenError,
  { collectionId: string; cardCount: number; classCount: number }
>

type TParsedCard = { index: number; card: TCard; status: TContentStatus | null }

/**
 * REQ-48. Valida o arquivo inteiro antes de gravar (todos os problemas
 * juntos, 400); depois confere os ids já usados (409) e grava. Os problemas
 * das cartas dependem da coleção do arquivo e só aparecem quando ela é válida.
 */
export class ImportCollectionUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly cardInputParser: CardInputParser
  ) {}

  async execute({
    body,
    replace,
  }: TImportCollectionUseCaseRequest): Promise<TImportCollectionUseCaseResponse> {
    if (!isRecord(body)) {
      return left(
        new ContentInvalidError([{ path: '', reason: 'notAnObject' }])
      )
    }

    const issues: TContentIssue[] = []

    if (body.formatVersion !== 1) {
      issues.push({ path: 'formatVersion', reason: 'unsupportedFormatVersion' })
    }

    const collection = this.readCollection(body.collection, issues)

    let parsedCards: TParsedCard[] = []
    if (!Array.isArray(body.cards)) {
      issues.push({ path: 'cards', reason: 'invalidFormat' })
    } else {
      parsedCards = this.readCards(body.cards, collection, issues)
    }

    if (
      body.classes !== undefined &&
      !(Array.isArray(body.classes) && body.classes.length === 0)
    ) {
      issues.push({ path: 'classes', reason: 'classesNotSupported' })
    }

    if (replace !== undefined && replace !== 'true' && replace !== 'false') {
      issues.push({ path: 'replace', reason: 'invalidReplace' })
    }

    if (issues.length > 0 || !collection) {
      return left(new ContentInvalidError(issues))
    }

    const replaceExisting = replace === 'true'

    const taken: TContentIssue[] = []
    if (
      !replaceExisting &&
      (await this.contentStore.findCollection(collection.id))
    ) {
      taken.push({ path: 'collection.id', reason: 'idTaken' })
    }
    for (const { index, card } of parsedCards) {
      const other = await this.contentStore.findEditorCard(card.id)
      if (other && other.card.collectionId !== collection.id) {
        taken.push({ path: `cards.${index}.card.id`, reason: 'idTaken' })
      }
    }
    if (taken.length > 0) return left(new ContentIdTakenError(taken))

    const cards: TEditorCard[] = parsedCards.flatMap(({ card, status }) =>
      status ? [{ status, card }] : []
    )
    await this.contentStore.importCollection(
      { collection, cards },
      replaceExisting
    )

    return right({
      collectionId: collection.id,
      cardCount: cards.length,
      classCount: 0,
    })
  }

  private readCollection(
    raw: unknown,
    issues: TContentIssue[]
  ): TCollectionInput | null {
    if (!isRecord(raw)) {
      issues.push({ path: 'collection', reason: 'notAnObject' })
      return null
    }
    const parsed = parseCollectionInput(raw)
    if (parsed.isLeft()) {
      issues.push(
        ...parsed.value.map((issue) => ({
          ...issue,
          path: `collection.${issue.path}`,
        }))
      )
      return null
    }
    return parsed.value
  }

  private readCards(
    entries: readonly unknown[],
    collection: TCollectionInput | null,
    issues: TContentIssue[]
  ): TParsedCard[] {
    const parsedCards: TParsedCard[] = []
    const seenIds = new Set<string>()

    entries.forEach((entry, index) => {
      const base = `cards.${index}`
      if (!isRecord(entry)) {
        issues.push({ path: base, reason: 'notAnObject' })
        return
      }

      const status = isContentStatus(entry.status) ? entry.status : null
      if (!status) {
        issues.push({ path: `${base}.status`, reason: 'unknownStatus' })
      }
      if (!isRecord(entry.card)) {
        issues.push({ path: `${base}.card`, reason: 'notAnObject' })
        return
      }
      if (!collection) return

      const raw = entry.card
      const idPath = `${base}.card.id`
      if (raw.collectionId !== collection.id) {
        issues.push({
          path: `${base}.card.collectionId`,
          reason: 'collectionMismatch',
        })
      }

      const prefix = `${collection.id}.`
      const id = raw.id
      if (
        typeof id !== 'string' ||
        !id.startsWith(prefix) ||
        !SLUG_PATTERN.test(id.slice(prefix.length))
      ) {
        issues.push({ path: idPath, reason: 'invalidIdFormat' })
        return
      }
      if (seenIds.has(id)) {
        issues.push({ path: idPath, reason: 'duplicateId' })
        return
      }
      seenIds.add(id)

      const parsed = this.cardInputParser.parse({
        ...Object.fromEntries(
          Object.entries(raw).filter(
            ([key]) => key !== 'id' && key !== 'collectionId'
          )
        ),
        slug: id.slice(prefix.length),
      })
      if (parsed.isLeft()) {
        issues.push(
          ...parsed.value.map((issue) => ({
            ...issue,
            path:
              issue.path === ''
                ? `${base}.card`
                : issue.path === 'slug'
                  ? idPath
                  : `${base}.card.${issue.path}`,
          }))
        )
        return
      }

      parsedCards.push({
        index,
        card: buildCard(parsed.value, collection.id),
        status,
      })
    })

    if (collection) {
      const indexById = new Map(
        parsedCards.map(({ index, card }) => [card.id, index])
      )
      const integrity = checkCatalogIntegrity({
        collections: [collection],
        cards: sortByCardId(parsedCards.map(({ card }) => card)),
      })
      for (const issue of integrity) {
        if (issue.cardId === null) continue
        // `id` e `collectionId` já foram conferidos acima.
        if (issue.field === 'id' || issue.field === 'collectionId') continue
        issues.push({
          path: `cards.${indexById.get(issue.cardId)}.card.${toContentPath(issue.field)}`,
          reason: issue.reason,
        })
      }
    }

    return parsedCards
  }
}
