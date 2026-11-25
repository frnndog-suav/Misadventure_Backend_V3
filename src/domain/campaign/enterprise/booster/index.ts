import type { SeededRng } from '@/core/rng/seeded-rng'
import {
  RARITIES,
  type TCard,
  type TItemCard,
  type TRarity,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPlayerState } from '../entities/party-member'
import { marketCandidatesOf, type TMarketCandidate } from '../markets'
import {
  receiveCard,
  type TReceiveAllCapacities,
  type TReceiveSpace,
} from '../mount'

/** Para onde foi uma carta do booster (CONTRATO `BoosterOpeningResult`). */
export type TBoosterDestination = TReceiveSpace | 'vault' | 'pending'

/** Resultado do `openBooster` aceito (REQ-144): as cartas na ordem do sorteio. */
export type TBoosterOpeningResult = Readonly<{
  boosterCardId: string
  via: 'prepare' | 'useVault'
  cards: readonly Readonly<{
    cardId: string
    destination: TBoosterDestination
  }>[]
}>

type TRng = Pick<SeededRng, 'nextInt'>

type TConfig = Pick<
  TGameConfigValues,
  | 'boosterCardCount'
  | 'boosterChanceCommon'
  | 'boosterChanceUncommon'
  | 'boosterChanceRare'
  | 'boosterChanceEpic'
  | 'boosterChanceLegendary'
>

export const isBooster = (card: TCard | undefined): card is TItemCard =>
  card?.type === 'item' && card.itemCategory === 'booster'

/**
 * Elegíveis do booster (README 24.3; REQ-144): as cartas publicadas da coleção
 * dele, com o mesmo filtro da vitrine (REQ-138), ordenadas por id (D-125).
 */
export function boosterCandidatesOf(
  cards: readonly TCard[],
  collectionId: string | null
): TMarketCandidate[] {
  return marketCandidatesOf(
    cards.filter((card) => card.collectionId === collectionId)
  )
}

const chanceOf = (config: TConfig, rarity: TRarity): number => {
  switch (rarity) {
    case 'common':
      return config.boosterChanceCommon
    case 'uncommon':
      return config.boosterChanceUncommon
    case 'rare':
      return config.boosterChanceRare
    case 'epic':
      return config.boosterChanceEpic
    case 'legendary':
      return config.boosterChanceLegendary
    default: {
      const _exhaustive: never = rarity
      return _exhaustive
    }
  }
}

/** Uma raridade pelas chances entre `pool`; a faixa é [0, soma - 1] (soma 0 → uniforme). */
function pickRarity(
  pool: readonly TRarity[],
  config: TConfig,
  rng: TRng
): TRarity {
  const total = pool.reduce((sum, rarity) => sum + chanceOf(config, rarity), 0)
  if (total === 0) return pool[rng.nextInt(0, pool.length - 1)]
  let roll = rng.nextInt(0, total - 1)
  for (const rarity of pool) {
    const chance = chanceOf(config, rarity)
    if (roll < chance) return rarity
    roll -= chance
  }
  return pool[pool.length - 1]
}

/**
 * Sorteia as cartas do booster (README 24.3; REQ-144; D-122), na ordem do
 * sorteio. Cada carta: raridade pelas chances e carta uniforme entre as
 * elegíveis dela; raridade sem elegíveis refaz o sorteio só entre as que têm.
 * A última é o slot garantido (sem a Comum; sem elegíveis de Incomum em
 * diante, vale como slot comum). Sem nenhuma elegível → `null`, sem RNG.
 */
export function drawBoosterCards(
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): string[] | null {
  if (candidates.length === 0) return null
  const byRarity = new Map<TRarity, string[]>()
  for (const { cardId, rarity } of candidates) {
    byRarity.set(rarity, [...(byRarity.get(rarity) ?? []), cardId])
  }
  const withCards = RARITIES.filter((rarity) => byRarity.has(rarity))

  const drawn: string[] = []
  for (let slot = 0; slot < config.boosterCardCount; slot++) {
    const guaranteed = slot === config.boosterCardCount - 1
    const above = withCards.filter((rarity) => rarity !== 'common')
    const pool: readonly TRarity[] =
      guaranteed && above.length > 0
        ? RARITIES.filter((rarity) => rarity !== 'common')
        : RARITIES
    const eligible = guaranteed && above.length > 0 ? above : withCards

    let rarity = pickRarity(pool, config, rng)
    if (!byRarity.has(rarity)) rarity = pickRarity(eligible, config, rng)
    const cards = byRarity.get(rarity) ?? []
    drawn.push(cards[rng.nextInt(0, cards.length - 1)])
  }
  return drawn
}

/**
 * Entrega do Preparar (README 6.5, 6.6; REQ-144, REQ-159): atributo → pasta e,
 * cheia, pasta extra (a vaga já foi conferida); recurso → inventário e, cheio,
 * inventário extra; o que não couber é `pending`. Cada carta é conferida em
 * ordem, sobre o resultado da anterior.
 */
export function placeBoosterInPrepare(input: {
  player: TPlayerState
  cards: readonly TCard[]
  drawn: readonly string[]
  capacities: TReceiveAllCapacities
}): {
  player: TPlayerState
  destinations: TBoosterDestination[]
} {
  let { player } = input
  const destinations = input.drawn.map((cardId): TBoosterDestination => {
    const card = input.cards.find((c) => c.id === cardId)
    if (
      card?.type !== 'attribute' &&
      card?.type !== 'equipment' &&
      card?.type !== 'item'
    )
      return 'pending'
    const received = receiveCard(player, card, 1, input.capacities)
    if (received === null) return 'pending'
    player = received.player
    return received.received[0].space
  })
  return { player, destinations }
}
