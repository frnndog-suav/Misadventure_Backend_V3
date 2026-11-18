import { ContentStore } from '@/domain/catalog/application/repositories/content-store'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

/** As cartas (qualquer status) de todas as coleções (REQ-82: citadas em `rewardDecks`). */
export async function loadAllCards(
  contentStore: ContentStore
): Promise<TEditorCard[]> {
  const cards: TEditorCard[] = []
  for (const collection of await contentStore.listCollections()) {
    cards.push(...(await contentStore.listEditorCards(collection.id)))
  }
  return cards
}

/** As cartas de fora de `collectionId`, só o `Card` (busca de citadas, D-91). */
export function cardsOutside(
  cards: readonly TEditorCard[],
  collectionId: string
) {
  return cards
    .map(({ card }) => card)
    .filter((card) => card.collectionId !== collectionId)
}

export function statusById(cards: readonly TEditorCard[]) {
  return new Map(cards.map(({ card, status }) => [card.id, status]))
}
