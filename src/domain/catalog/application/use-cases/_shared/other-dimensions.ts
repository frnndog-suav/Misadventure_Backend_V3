import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import type { TDimensionCard } from '@/domain/catalog/enterprise/value-objects/card'

/** As Cartas de Dimensão (qualquer status) das coleções que não são `collectionId` (REQ-26). */
export async function loadOtherDimensions(
  contentStore: ContentStore,
  collectionId: string
): Promise<TDimensionCard[]> {
  const dimensions: TDimensionCard[] = []
  for (const collection of await contentStore.listCollections()) {
    if (collection.id === collectionId) continue
    for (const { card } of await contentStore.listEditorCards(collection.id)) {
      if (card.type === 'dimension') dimensions.push(card)
    }
  }
  return dimensions
}
