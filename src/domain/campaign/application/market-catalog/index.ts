import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type { TItemCard } from '@/domain/catalog/enterprise/value-objects/card'

/**
 * Boosters à venda (README 24.3; REQ-141 b): itens `booster` publicados, de
 * qualquer coleção, cuja `boosterCollectionId` é a coleção vigente (D-116).
 */
export async function findMarketBoosters(
  catalog: CardCatalog,
  collectionId: string
): Promise<TItemCard[]> {
  const boosters: TItemCard[] = []
  for (const { id } of await catalog.listCollections()) {
    for (const card of await catalog.listCards(id)) {
      if (
        card.type === 'item' &&
        card.itemCategory === 'booster' &&
        card.boosterCollectionId === collectionId
      ) {
        boosters.push(card)
      }
    }
  }
  return boosters
}
