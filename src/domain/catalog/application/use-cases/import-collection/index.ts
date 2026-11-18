import { type Either, left, right } from '@/core/error/either'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { CardInputParser } from '@/domain/catalog/application/repositories/card-input-parser'
import { ClassInputParser } from '@/domain/catalog/application/repositories/class-input-parser'
import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import { ContentIdTakenError } from '@/domain/catalog/application/use-cases/_errors/content-id-taken-error'
import { ContentInUseError } from '@/domain/catalog/application/use-cases/_errors/content-in-use-error'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import {
  cardsOutside,
  loadAllCards,
  statusById,
} from '@/domain/catalog/application/use-cases/_shared/all-cards'
import {
  buildCard,
  isCitedInRewardDeck,
  rewardDeckPublicationIssues,
  sortByCardId,
  toContentPath,
} from '@/domain/catalog/enterprise/card-validation'
import { validateClassCandidate } from '@/domain/catalog/enterprise/class-validation'
import { parseCollectionInput } from '@/domain/catalog/enterprise/collection-input'
import type {
  TCard,
  TClassDefinition,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  isContentStatus,
  isRecord,
  SLUG_PATTERN,
  type TClassInput,
  type TCollectionInput,
  type TContentIssue,
  type TContentStatus,
  type TEditorCard,
  type TEditorClass,
} from '@/domain/catalog/enterprise/value-objects/content'

export type TImportCollectionUseCaseRequest = {
  /** Arquivo cru (`CollectionExport`). */
  body: unknown
  /** Parâmetro `replace` cru: ausente, `'true'` ou `'false'`. */
  replace?: unknown
}

export type TImportCollectionUseCaseResponse = Either<
  | ContentInvalidError
  | ContentIdTakenError
  | ContentInUseError
  | ContentReferencedError,
  { collectionId: string; cardCount: number; classCount: number }
>

type TParsedCard = { index: number; card: TCard; status: TContentStatus | null }

type TParsedClass = {
  index: number
  definition: TClassDefinition
  status: TContentStatus
}

/**
 * REQ-48. Valida o arquivo inteiro antes de gravar (todos os problemas
 * juntos, 400); depois confere os ids já usados (409), o conteúdo da coleção
 * substituída usado por save (409 `CONTENT_IN_USE`, REQ-39) ou por classe de
 * outra coleção (409 `CONTENT_REFERENCED`, D-60) e grava. Os problemas das
 * cartas dependem da coleção do arquivo e só aparecem quando ela é válida; as
 * regras das classes (REQ-38) só são conferidas quando o resto do arquivo está
 * sem problemas, porque dependem das cartas do arquivo.
 */
export class ImportCollectionUseCase {
  constructor(
    private readonly contentStore: ContentStore,
    private readonly cardInputParser: CardInputParser,
    private readonly classInputParser: ClassInputParser,
    private readonly partiesRepository: PartiesRepository
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

    // REQ-82 (D-91): cartas das outras coleções citadas em `rewardDecks`.
    const outside = collection
      ? (await loadAllCards(this.contentStore)).filter(
          ({ card }) => card.collectionId !== collection.id
        )
      : []

    let parsedCards: TParsedCard[] = []
    if (!Array.isArray(body.cards)) {
      issues.push({ path: 'cards', reason: 'invalidFormat' })
    } else {
      parsedCards = this.readCards(
        body.cards,
        collection,
        issues,
        cardsOutside(outside, collection?.id ?? '')
      )
      const statuses = statusById([
        ...outside,
        ...parsedCards.flatMap(({ card, status }) =>
          status ? [{ status, card }] : []
        ),
      ])
      for (const { index, card, status } of parsedCards) {
        if (status !== 'published') continue
        for (const issue of rewardDeckPublicationIssues(card, statuses)) {
          issues.push({ ...issue, path: `cards.${index}.card.${issue.path}` })
        }
      }
    }

    let parsedClasses: TParsedClass[] = []
    if (body.classes !== undefined) {
      if (!Array.isArray(body.classes)) {
        issues.push({ path: 'classes', reason: 'invalidFormat' })
      } else {
        parsedClasses = this.readClasses(body.classes, collection, issues)
      }
    }

    if (replace !== undefined && replace !== 'true' && replace !== 'false') {
      issues.push({ path: 'replace', reason: 'invalidReplace' })
    }

    if (issues.length === 0 && collection) {
      issues.push(
        ...(await this.checkClassRules(collection, parsedCards, parsedClasses))
      )
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

    const otherClasses = await this.classesOutside(collection.id)
    const seenClasses = new Set<string>()
    for (const { index, definition } of parsedClasses) {
      if (
        seenClasses.has(definition.playerClass) ||
        otherClasses.some(
          (entry) =>
            entry.classDefinition.playerClass === definition.playerClass
        )
      ) {
        taken.push({
          path: `classes.${index}.classDefinition.playerClass`,
          reason: 'idTaken',
        })
      }
      seenClasses.add(definition.playerClass)
    }
    if (taken.length > 0) return left(new ContentIdTakenError(taken))

    if (
      replaceExisting &&
      (await this.contentStore.findCollection(collection.id))
    ) {
      const blocked = await this.checkReplacement(
        collection.id,
        parsedCards.map(({ card }) => card.id),
        otherClasses,
        outside.map(({ card }) => card)
      )
      if (blocked) return left(blocked)
    }

    const cards: TEditorCard[] = parsedCards.flatMap(({ card, status }) =>
      status ? [{ status, card }] : []
    )
    const classes: TEditorClass[] = parsedClasses.map(
      ({ definition, status }) => ({ status, classDefinition: definition })
    )
    await this.contentStore.importCollection(
      { collection, cards, classes },
      replaceExisting
    )

    return right({
      collectionId: collection.id,
      cardCount: cards.length,
      classCount: classes.length,
    })
  }

  /** As classes das outras coleções (as da coleção do arquivo são trocadas junto). */
  private async classesOutside(collectionId: string): Promise<TEditorClass[]> {
    return (await this.contentStore.listEditorClasses()).filter(
      ({ classDefinition }) => classDefinition.collectionId !== collectionId
    )
  }

  /**
   * A coleção que o `replace` troca: carta ou classe dela usada por save →
   * `CONTENT_IN_USE`; carta que some e está no `starterDeck` de classe de
   * outra coleção → `CONTENT_REFERENCED`.
   */
  private async checkReplacement(
    collectionId: string,
    keptCardIds: readonly string[],
    otherClasses: readonly TEditorClass[],
    outsideCards: readonly TCard[]
  ): Promise<ContentInUseError | ContentReferencedError | null> {
    const oldCardIds = (
      await this.contentStore.listEditorCards(collectionId)
    ).map(({ card }) => card.id)
    const oldClasses = (await this.contentStore.listEditorClasses()).filter(
      ({ classDefinition }) => classDefinition.collectionId === collectionId
    )
    const inUse = await this.partiesRepository.findContentInUse()
    if (
      oldCardIds.some((id) => inUse.cardIds.has(id)) ||
      oldClasses.some(({ classDefinition }) =>
        inUse.playerClasses.has(classDefinition.playerClass)
      )
    ) {
      return new ContentInUseError()
    }

    const kept = new Set(keptCardIds)
    const removed = new Set(oldCardIds.filter((id) => !kept.has(id)))
    if (
      otherClasses.some(({ classDefinition }) =>
        classDefinition.starterDeck.some((entry) => removed.has(entry.cardId))
      )
    ) {
      return new ContentReferencedError()
    }
    // REQ-82: carta que some e é citada por dimensão de outra coleção.
    if (isCitedInRewardDeck(outsideCards, removed)) {
      return new ContentReferencedError('rewardDeck')
    }
    return null
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

  private readClasses(
    entries: readonly unknown[],
    collection: TCollectionInput | null,
    issues: TContentIssue[]
  ): TParsedClass[] {
    const parsedClasses: TParsedClass[] = []

    entries.forEach((entry, index) => {
      const base = `classes.${index}`
      if (!isRecord(entry)) {
        issues.push({ path: base, reason: 'notAnObject' })
        return
      }

      const status = isContentStatus(entry.status) ? entry.status : null
      if (!status) {
        issues.push({ path: `${base}.status`, reason: 'unknownStatus' })
      }
      const definitionPath = `${base}.classDefinition`
      if (!isRecord(entry.classDefinition)) {
        issues.push({ path: definitionPath, reason: 'notAnObject' })
        return
      }
      if (!collection) return

      const raw = entry.classDefinition
      const sameCollection = raw.collectionId === collection.id
      if (!sameCollection) {
        issues.push({
          path: `${definitionPath}.collectionId`,
          reason: 'collectionMismatch',
        })
      }

      const parsed = this.classInputParser.parse(
        Object.fromEntries(
          Object.entries(raw).filter(([key]) => key !== 'collectionId')
        )
      )
      if (parsed.isLeft()) {
        issues.push(
          ...parsed.value.map((issue) => ({
            ...issue,
            path:
              issue.path === ''
                ? definitionPath
                : `${definitionPath}.${issue.path}`,
          }))
        )
        return
      }

      if (status && sameCollection) {
        parsedClasses.push({
          index,
          definition: classOf(parsed.value, collection.id),
          status,
        })
      }
    })

    return parsedClasses
  }

  /**
   * Regras de REQ-38 de cada classe contra as cartas do arquivo e as das
   * outras coleções, e contra as classes de outras coleções e as anteriores do
   * arquivo (a repetição recai sobre a que vem depois).
   */
  private async checkClassRules(
    collection: TCollectionInput,
    parsedCards: readonly TParsedCard[],
    parsedClasses: readonly TParsedClass[]
  ): Promise<TContentIssue[]> {
    const issues: TContentIssue[] = []
    const fileCards = new Map<string, TEditorCard>(
      parsedCards.flatMap(({ card, status }) =>
        status ? [[card.id, { status, card }] as const] : []
      )
    )
    const outside = await this.classesOutside(collection.id)
    const prefix = `${collection.id}.`

    for (const [
      position,
      { index, definition, status },
    ] of parsedClasses.entries()) {
      const cards: TEditorCard[] = []
      for (const { cardId } of definition.starterDeck) {
        const entry =
          fileCards.get(cardId) ??
          (cardId.startsWith(prefix)
            ? null
            : await this.contentStore.findEditorCard(cardId))
        if (entry) cards.push(entry)
      }
      const before: TEditorClass[] = parsedClasses
        .slice(0, position)
        .map((previous) => ({
          status: previous.status,
          classDefinition: previous.definition,
        }))
      const others = [...outside, ...before].filter(
        ({ classDefinition }) =>
          classDefinition.playerClass !== definition.playerClass
      )

      for (const issue of validateClassCandidate({
        candidate: definition,
        status,
        others,
        cards,
      })) {
        issues.push({
          ...issue,
          path: `classes.${index}.classDefinition.${issue.path}`,
        })
      }
    }

    return issues
  }

  private readCards(
    entries: readonly unknown[],
    collection: TCollectionInput | null,
    issues: TContentIssue[],
    referenceCards: readonly TCard[]
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
        referenceCards,
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

function classOf(input: TClassInput, collectionId: string): TClassDefinition {
  return { ...input, collectionId }
}
