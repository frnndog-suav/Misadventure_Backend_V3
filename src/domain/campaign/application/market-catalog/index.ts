import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TItemCard,
} from '@/domain/catalog/enterprise/value-objects/card'

export async function listMarketCards(
  catalog: CardCatalog,
  collectionIds: readonly string[]
): Promise<TCard[]> {
  const cards = (
    await Promise.all(collectionIds.map((id) => catalog.listCards(id)))
  ).flat()
  return [...new Map(cards.map((card) => [card.id, card])).values()]
}

/**
 * Boosters à venda (README 24.3; REQ-141 b): itens `booster` publicados, de
 * qualquer coleção, cuja `boosterCollectionId` é a coleção vigente (D-116).
 */
export async function findMarketBoosters(
  catalog: CardCatalog,
  collectionIds: readonly string[]
): Promise<TItemCard[]> {
  const boosters: TItemCard[] = []
  for (const { id } of await catalog.listCollections()) {
    for (const card of await catalog.listCards(id)) {
      if (
        card.type === 'item' &&
        card.itemCategory === 'booster' &&
        card.boosterCollectionId !== null &&
        collectionIds.includes(card.boosterCollectionId)
      ) {
        boosters.push(card)
      }
    }
  }
  return boosters
}
