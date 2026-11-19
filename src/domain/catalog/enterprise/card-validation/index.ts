import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import { effectCitations } from '@/domain/catalog/enterprise/effect-rules'
import type {
  TCard,
  TDimensionCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  SLUG_PATTERN,
  type TCardInput,
  type TContentCollection,
  type TContentIssue,
  type TContentStatus,
} from '@/domain/catalog/enterprise/value-objects/content'

/** `<coleção>.<slug>` (D-22). */
export function buildCardId(collectionId: string, slug: string): string {
  return `${collectionId}.${slug}`
}

export function slugOf(card: TCard): string {
  return card.id.slice(card.collectionId.length + 1)
}

/** Monta a carta a partir do corpo já no formato (REQ-44). */
export function buildCard(input: TCardInput, collectionId: string): TCard {
  const { slug, ...rest } = input
  return { ...rest, id: buildCardId(collectionId, slug), collectionId } as TCard
}

/** `enemies[0].health` → `enemies.0.health` (caminho do contrato). */
export function toContentPath(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1')
}

export function sortByCardId<T extends { readonly id: string }>(
  cards: readonly T[]
): T[] {
  return [...cards].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Problemas da carta candidata (REQ-43, D-50), na ordem `slug` e depois as
 * regras de REQ-15 sobre a coleção com a candidata no lugar da antiga.
 * `others` = as outras cartas da coleção, de qualquer status. A coleção é
 * percorrida por `id` e o título de zona repetido recai sobre a carta que vem
 * depois, então só os problemas da candidata voltam. Carta nova (sem
 * `replacedId`) vai por último, e qualquer zona de mesmo título conflita;
 * carta que já existe (`replacedId` = o id que ela tinha) mantém o lugar
 * dele, então editar ou publicar a original não é barrado pela cópia (D-50,
 * D-54). A unicidade de id fica com o caso de uso (vira 409, não 400).
 * `otherDimensions` = as Cartas de Dimensão das outras coleções: o
 * `releaseOrder` é único no catálogo todo (REQ-26); vão antes das da coleção
 * para a duplicata recair sobre a candidata.
 * `referenceCards` = as cartas das outras coleções, só para achar as citadas
 * em `rewardDecks` (REQ-82, D-91).
 */
export function validateCandidate(
  collection: TContentCollection,
  others: readonly TCard[],
  candidate: TCard,
  replacedId?: string,
  otherDimensions: readonly TDimensionCard[] = [],
  referenceCards: readonly TCard[] = []
): TContentIssue[] {
  const issues: TContentIssue[] = []

  if (!SLUG_PATTERN.test(slugOf(candidate))) {
    issues.push({ path: 'slug', reason: 'invalidIdFormat' })
  }

  const rest = sortByCardId(
    others.filter((card) => card.id !== candidate.id && card.id !== replacedId)
  )
  const cards =
    replacedId === undefined
      ? [...rest, candidate]
      : [
          ...rest.filter((card) => card.id < replacedId),
          candidate,
          ...rest.filter((card) => card.id > replacedId),
        ]
  for (const issue of checkCatalogIntegrity({
    collections: [collection],
    cards: [...otherDimensions, ...cards],
    referenceCards,
  })) {
    if (issue.cardId !== candidate.id) continue
    // `id` e `collectionId` saem do `slug` e da rota, não do corpo.
    if (issue.field === 'id' || issue.field === 'collectionId') continue
    issues.push({ path: toContentPath(issue.field), reason: issue.reason })
  }

  return issues
}

/**
 * REQ-82: ao publicar (ou editar publicada), cada carta citada em
 * `rewardDecks` precisa estar `published`. `statusById` = status das cartas
 * de todas as coleções; carta ausente já é `unknownCard` da integridade.
 */
export function rewardDeckPublicationIssues(
  candidate: TCard,
  statusById: ReadonlyMap<string, TContentStatus>
): TContentIssue[] {
  if (candidate.type !== 'dimension') return []
  const issues: TContentIssue[] = []
  candidate.rewardDecks.forEach((deck, index) => {
    deck.cards.forEach((entry, cardIndex) => {
      const status = statusById.get(entry.cardId)
      if (status !== undefined && status !== 'published') {
        issues.push({
          path: `rewardDecks.${index}.cards.${cardIndex}.cardId`,
          reason: 'rewardDeckCardNotPublished',
        })
      }
    })
  })
  return issues
}

/** REQ-82: alguma Carta de Dimensão cita uma destas cartas em `rewardDecks`? */
export function isCitedInRewardDeck(
  cards: readonly TCard[],
  cardIds: ReadonlySet<string>
): boolean {
  return cards.some(
    (card) =>
      card.type === 'dimension' &&
      card.rewardDecks.some((deck) =>
        deck.cards.some((entry) => cardIds.has(entry.cardId))
      )
  )
}

/**
 * REQ-99 (D-91): ao publicar, a carta e o título de zona citados pelos efeitos
 * precisam existir no catálogo. `cards` = as cartas de todas as coleções
 * (a candidata incluída, para citar a si mesma).
 */
export function effectCitationPublicationIssues(
  candidate: TCard,
  cards: readonly TCard[]
): TContentIssue[] {
  if (candidate.type === 'randomEvent' || candidate.type === 'combatEvent') {
    return []
  }
  const cardIds = new Set(cards.map((card) => card.id))
  const zoneTitles = new Set(
    cards.flatMap((card) => (card.type === 'zone' ? [card.title] : []))
  )
  const issues: TContentIssue[] = []
  for (const citation of effectCitations(candidate)) {
    if (citation.type === 'card' && !cardIds.has(citation.value)) {
      issues.push({ path: citation.path, reason: 'citedCardNotFound' })
    } else if (citation.type === 'zone' && !zoneTitles.has(citation.value)) {
      issues.push({ path: citation.path, reason: 'citedZoneNotFound' })
    }
  }
  return issues
}
