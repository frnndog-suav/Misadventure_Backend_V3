import type { TCard, TDimensionCard } from '../value-objects/card'
import type { TContentIssue, TEditorCard } from '../value-objects/content'

export function commercialCollectionsOf(dimension: TDimensionCard): string[] {
  return [
    ...new Set([
      dimension.collectionId,
      ...(dimension.extendedCollectionIds ?? []),
      ...(dimension.reprintCollectionIds ?? []),
    ]),
  ]
}

export function commercialCollectionPublicationIssues(
  card: TCard,
  cards: readonly TEditorCard[]
): TContentIssue[] {
  if (card.type !== 'dimension') return []

  const earlier = new Set(
    cards.flatMap(({ card: other, status }) =>
      status === 'published' &&
      other.type === 'dimension' &&
      other.releaseOrder < card.releaseOrder
        ? [other.collectionId]
        : []
    )
  )
  const seen = new Set<string>()
  const issues: TContentIssue[] = []
  for (const field of [
    'extendedCollectionIds',
    'reprintCollectionIds',
  ] as const) {
    for (const [index, id] of (card[field] ?? []).entries()) {
      const path = `${field}.${index}`
      if (seen.has(id)) {
        issues.push({ path, reason: 'duplicateValue' })
      } else if (id === card.collectionId || !earlier.has(id)) {
        issues.push({
          path,
          reason: 'invalidFormat',
          message:
            'Informe uma coleção de outra dimensão publicada anteriormente.',
        })
      }
      seen.add(id)
    }
  }
  return issues
}

export function breaksCommercialCollectionReferences(
  collectionId: string,
  before: readonly TEditorCard[],
  after: readonly TEditorCard[]
): boolean {
  return before.some(
    ({ card, status }) =>
      status === 'published' &&
      card.type === 'dimension' &&
      card.collectionId !== collectionId &&
      (card.extendedCollectionIds?.includes(collectionId) ||
        card.reprintCollectionIds?.includes(collectionId)) &&
      before.some(isEarlierRelease(card.releaseOrder)) &&
      !after.some(isEarlierRelease(card.releaseOrder))
  )

  function isEarlierRelease(releaseOrder: number) {
    return ({ card, status }: TEditorCard) =>
      status === 'published' &&
      card.type === 'dimension' &&
      card.collectionId === collectionId &&
      card.releaseOrder < releaseOrder
  }
}
