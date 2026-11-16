import {
  CARD_TYPES,
  RARITIES,
  type TCardType,
  type TRarity,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TContentCollection,
  TEditorCard,
} from '@/domain/catalog/enterprise/value-objects/content'

export type TEditorCollectionSummary = TContentCollection & {
  publishedCount: number
  draftCount: number
}

/** `EditorCollection` do contrato: contagens de todas as cartas (REQ-42). */
export type TEditorCollection = TEditorCollectionSummary & {
  cardCounts: Record<TCardType, number>
  rarityCounts: Record<TRarity, number>
  tags: string[]
}

export function summarizeCollection(
  collection: TContentCollection,
  cards: readonly TEditorCard[]
): TEditorCollectionSummary {
  const publishedCount = cards.filter(
    (entry) => entry.status === 'published'
  ).length
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    publishedCount,
    draftCount: cards.length - publishedCount,
  }
}

export function describeCollection(
  collection: TContentCollection,
  cards: readonly TEditorCard[]
): TEditorCollection {
  const cardCounts = Object.fromEntries(
    CARD_TYPES.map((type) => [type, 0])
  ) as Record<TCardType, number>
  const rarityCounts = Object.fromEntries(
    RARITIES.map((rarity) => [rarity, 0])
  ) as Record<TRarity, number>
  const tags = new Set<string>()

  for (const { card } of cards) {
    cardCounts[card.type] += 1
    switch (card.type) {
      case 'equipment':
      case 'item':
        rarityCounts[card.rarity] += 1
        for (const tag of card.tags) tags.add(tag)
        break
      case 'attribute':
        rarityCounts[card.rarity] += 1
        break
      case 'zone':
      case 'randomEvent':
      case 'combatEvent':
      case 'dimension':
        break
      default: {
        const _exhaustive: never = card
        void _exhaustive
      }
    }
  }

  return {
    ...summarizeCollection(collection, cards),
    cardCounts,
    rarityCounts,
    tags: [...tags].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  }
}
