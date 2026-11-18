import type { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TDimensionCard,
  TRewardDeck,
  TZoneCard,
  TZoneType,
} from '@/domain/catalog/enterprise/value-objects/card'

import type { TPlayerState } from '../entities/party-member'
import { shuffle } from '../shuffle'

/** Deck de recompensas da partida (README 3.4, D-87): ordem secreta; o topo é o índice 0. */
export type TPartyRewardDeck = Readonly<{
  zoneType: TZoneType
  cards: readonly string[]
}>

/**
 * REQ-89: um deck por entrada de `rewardDecks`, na ordem da carta; as cópias
 * expandidas na ordem listada e embaralhadas pelo RNG (D-38).
 */
export function assembleRewardDecks(
  rewardDecks: readonly TRewardDeck[],
  rng: SeededRng
): TPartyRewardDeck[] {
  return rewardDecks.map(({ zoneType, cards }) => ({
    zoneType,
    cards: shuffle(
      cards.flatMap(({ cardId, copies }) =>
        Array.from({ length: copies }, () => cardId)
      ),
      rng
    ),
  }))
}

/**
 * Alvos do Vasculhar (README 12.6; REQ-90, D-86, D-87), em ordem de `cardId`.
 * Vazio se a zona não tem `scavenge`. Senão, as cartas distintas da entrada de
 * `rewardDecks` da dimensão para o tipo da zona cuja `scavengeTool` é o
 * `toolKind` de um item `tool` do inventário que vasculha esse tipo. Sai da
 * composição na carta, não do deck atual (D-74). `cards`: as cartas do
 * inventário e as citadas pela entrada (lidas no catálogo).
 */
export function scavengeTargets({
  player,
  zone,
  dimension,
  cards,
}: {
  player: TPlayerState
  zone: TZoneCard | null
  dimension: TDimensionCard | null
  cards: readonly TCard[]
}): string[] {
  if (zone === null || dimension === null) return []
  if (!zone.zoneActions.includes('scavenge')) return []
  const entry = dimension.rewardDecks.find((d) => d.zoneType === zone.zoneType)
  if (!entry) return []

  const toolKinds = new Set<string>()
  for (const { cardId } of player.inventory) {
    const card = cards.find((c) => c.id === cardId)
    if (
      card?.type === 'item' &&
      card.itemCategory === 'tool' &&
      card.toolKind !== null &&
      card.scavengeZoneTypes.includes(zone.zoneType)
    ) {
      toolKinds.add(card.toolKind)
    }
  }

  const targets = new Set<string>()
  for (const { cardId } of entry.cards) {
    const card = cards.find((c) => c.id === cardId)
    if (
      (card?.type === 'item' || card?.type === 'equipment') &&
      card.scavengeTool !== null &&
      toolKinds.has(card.scavengeTool)
    ) {
      targets.add(cardId)
    }
  }
  return [...targets].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
