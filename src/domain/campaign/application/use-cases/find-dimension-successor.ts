import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TCard,
  TDimensionCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { Party } from '../../enterprise/entities/party'
import { listMarketCards } from '../market-catalog'
import { commercialCollectionsOf } from '@/domain/catalog/enterprise/commercial-collections'

export async function findDimensionSuccessor(
  catalog: CardCatalog,
  current: TDimensionCard
) {
  let successor: { dimension: TDimensionCard; cards: readonly TCard[] } | null =
    null
  for (const { id } of await catalog.listCollections()) {
    const cards = await catalog.listCards(id)
    for (const card of cards) {
      if (
        card.type === 'dimension' &&
        card.releaseOrder > current.releaseOrder &&
        (!successor || card.releaseOrder < successor.dimension.releaseOrder)
      )
        successor = { dimension: card, cards }
    }
  }
  if (!successor) return null
  return {
    ...successor,
    marketCards: await listMarketCards(
      catalog,
      commercialCollectionsOf(successor.dimension)
    ),
  }
}

export async function findFrozenDimensionSuccessor(
  catalog: CardCatalog,
  party: Party
) {
  if (
    party.status !== 'frozen' ||
    party.lastDimensionCompletion?.next.type !== 'frozen'
  )
    return null
  const current = await catalog.findCard(party.dimension.dimensionCardId)
  return current?.type === 'dimension'
    ? findDimensionSuccessor(catalog, current)
    : null
}
