import {
  checkCatalogIntegrity,
  checkQuestReferences,
  combatExecutionFields,
} from '@/domain/catalog/enterprise/catalog-integrity'
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
  type TEditorCard,
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
 * em `rewardDecks` (REQ-82, D-91) e no estoque do mercado (REQ-136).
 * `referenceCollectionIds` = os ids das outras coleções, só para o
 * `boosterCollectionId` (REQ-136).
 */
export function validateCandidate(
  collection: TContentCollection,
  others: readonly TCard[],
  candidate: TCard,
  replacedId?: string,
  otherDimensions: readonly TDimensionCard[] = [],
  referenceCards: readonly TCard[] = [],
  referenceCollectionIds: readonly string[] = []
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
    referenceCollectionIds,
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
  if (candidate.type === 'randomEvent') {
    return randomEventRewardCitations(candidate).flatMap(({ path, cardId }) =>
      statusById.get(cardId) === 'published'
        ? []
        : [{ path, reason: 'rewardDeckCardNotPublished' }]
    )
  }
  if (candidate.type !== 'dimension') return []
  const issues: TContentIssue[] = []
  for (const field of ['rewardDecks', 'eventDecks'] as const) {
    candidate[field]?.forEach((deck, index) => {
      deck.cards.forEach((entry, cardIndex) => {
        const status = statusById.get(entry.cardId)
        if (status !== undefined && status !== 'published') {
          issues.push({
            path: `${field}.${index}.cards.${cardIndex}.cardId`,
            reason: 'rewardDeckCardNotPublished',
          })
        }
      })
    })
  }
  return issues
}

function randomEventRewardCitations(
  card: Extract<TCard, { type: 'randomEvent' }>
) {
  return (['goodOutcome', 'badOutcome'] as const).flatMap((field) => {
    const outcome = card[field]
    if (!('steps' in outcome)) return []
    return outcome.steps.flatMap((step, index) =>
      step.type === 'searchReward' || step.type === 'grantReward'
        ? [{ cardId: step.cardId, path: `${field}.steps.${index}.cardId` }]
        : []
    )
  })
}

/** REQ-82: alguma Carta de Dimensão cita uma destas cartas em `rewardDecks`? */
export function isCitedInRewardDeck(
  cards: readonly TCard[],
  cardIds: ReadonlySet<string>,
  deckType?: 'reward' | 'event'
): boolean {
  return cards.some((card) => {
    if (card.type === 'dimension') {
      const decks = [
        ...(deckType !== 'event' ? card.rewardDecks : []),
        ...(deckType !== 'reward' ? (card.eventDecks ?? []) : []),
      ]
      return decks.some((deck) =>
        deck.cards.some(({ cardId }) => cardIds.has(cardId))
      )
    }
    return (
      deckType !== 'event' &&
      card.type === 'randomEvent' &&
      randomEventRewardCitations(card).some(({ cardId }) => cardIds.has(cardId))
    )
  })
}

/**
 * Cartas que citam outras: para conferir a citação, a candidata vê também as
 * cartas de outras coleções (REQ-82, REQ-136, REQ-145).
 */
export function citesOtherCards(card: TCard): boolean {
  return (
    card.type === 'dimension' ||
    card.type === 'randomEvent' ||
    card.type === 'zone' ||
    card.type === 'equipment' ||
    card.type === 'item'
  )
}

/**
 * REQ-145: alguma carta cita uma destas como material de refino, de receita ou
 * de encantamento, ou como o equipamento que a receita cria?
 */
export function isCitedInBlacksmith(
  cards: readonly TCard[],
  cardIds: ReadonlySet<string>
): boolean {
  const cites = (list: readonly { cardId: string }[]) =>
    list.some(({ cardId }) => cardIds.has(cardId))
  return cards.some((card) => {
    switch (card.type) {
      case 'equipment':
        return card.refinement !== null && cites(card.refinement.materials)
      case 'item':
        return (
          card.recipe !== null &&
          (cardIds.has(card.recipe.equipmentId) || cites(card.recipe.materials))
        )
      case 'zone':
        return (
          card.blacksmith?.enchantments.some(({ materials }) =>
            cites(materials)
          ) ?? false
        )
      default:
        return false
    }
  })
}

/**
 * REQ-145, D-135: equipamento refinável sem materiais (conteúdo legado) não
 * publica.
 */
export function refinementPublicationIssues(card: TCard): TContentIssue[] {
  return card.type === 'equipment' &&
    card.refinement !== null &&
    card.refinement.materials.length === 0
    ? [{ path: 'refinement.materials', reason: 'refinementMaterialsRequired' }]
    : []
}

/** REQ-136: alguma zona cita uma destas cartas no estoque do mercado? */
export function isCitedInMarketStock(
  cards: readonly TCard[],
  cardIds: ReadonlySet<string>
): boolean {
  return cards.some(
    (card) =>
      card.type === 'zone' &&
      (card.market?.stock.some((id) => cardIds.has(id)) ?? false)
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
  if (!('effects' in candidate)) {
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

export function questPublicationIssues(
  candidate: TCard,
  entries: readonly TEditorCard[]
): TContentIssue[] {
  if (candidate.type !== 'zone' && candidate.type !== 'zoneQuest') return []
  if (candidate.type === 'zone' && !candidate.questDeck?.length) return []
  const relevant = entries.filter(
    ({ card }) =>
      card.collectionId === candidate.collectionId && card.id !== candidate.id
  )
  const all = new Map(relevant.map(({ card }) => [card.id, card]))
  const published = new Map(
    relevant
      .filter(({ status }) => status === 'published')
      .map(({ card }) => [card.id, card])
  )
  all.set(candidate.id, candidate)
  published.set(candidate.id, candidate)

  const existing = new Set<string>()
  checkQuestReferences(candidate, all, (path) => existing.add(path))
  const issues: TContentIssue[] = []
  checkQuestReferences(candidate, published, (path, reason) => {
    if (!existing.has(path)) issues.push({ path, reason })
  })
  if (candidate.type === 'zone') {
    const assigned = new Set(
      [...published.values()].flatMap((card) =>
        card.type === 'zone' && card.id !== candidate.id
          ? (card.questDeck ?? [])
          : []
      )
    )
    const seen = new Set<string>()
    candidate.questDeck?.forEach((id, index) => {
      if (assigned.has(id) && !seen.has(id)) {
        issues.push({ path: `questDeck.${index}`, reason: 'duplicateValue' })
      }
      seen.add(id)
    })
  }
  return issues
}

export function breaksQuestReferences(
  entries: readonly TEditorCard[],
  current: TEditorCard,
  replacement?: TCard
): boolean {
  const local = entries.filter(
    ({ card }) => card.collectionId === current.card.collectionId
  )
  const all = new Map(local.map(({ card }) => [card.id, card]))
  const published = new Map(
    local
      .filter(({ status }) => status === 'published')
      .map(({ card }) => [card.id, card])
  )
  const nextAll = new Map(all)
  const nextPublished = new Map(published)
  nextAll.delete(current.card.id)
  nextPublished.delete(current.card.id)
  if (replacement) {
    nextAll.set(replacement.id, replacement)
    if (current.status === 'published')
      nextPublished.set(replacement.id, replacement)
  }

  for (const { card, status } of local) {
    if (
      card.id === current.card.id ||
      (card.type !== 'zoneQuest' && card.type !== 'zone')
    )
      continue
    if (card.type === 'zone' && !card.questDeck?.length) continue
    const before = new Set<string>()
    checkQuestReferences(
      card,
      status === 'published' ? published : all,
      (path) => before.add(path)
    )
    let broken = false
    checkQuestReferences(
      card,
      status === 'published' ? nextPublished : nextAll,
      (path) => {
        if (!before.has(path)) broken = true
      }
    )
    if (broken) return true
  }
  return false
}

export function combatDeckPublicationIssues(
  candidate: TCard,
  cards: readonly TCard[]
): TContentIssue[] {
  if (candidate.type !== 'dimension') return []
  const byId = new Map(cards.map((card) => [card.id, card]))
  return (candidate.eventDecks ?? []).flatMap((deck, index) =>
    deck.cards.flatMap(({ cardId }, cardIndex) => {
      const card = byId.get(cardId)
      if (card?.type !== 'combatEvent') return []
      return combatExecutionFields(card).map((field): TContentIssue => ({
        path: `eventDecks.${index}.cards.${cardIndex}.cardId.${field}`,
        reason: 'combatEventNotExecutable',
      }))
    })
  )
}
