import type { SeededRng } from '@/core/rng/seeded-rng'
import type { TZoneType } from '@/domain/catalog/enterprise/value-objects/card'
import type { TReserveDeckEntry } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TReceiveSpace } from '../mount'

export type TRewardOrigin =
  | { type: 'rewardDeck'; zoneType: TZoneType }
  | { type: 'reserveDeck' }
  | { type: 'fixed' }

/**
 * Descarte da recompensa pendente (REQ-91; REQ-159, D-148): `space` ausente =
 * o espaço principal do destino.
 */
export type TRewardDiscard = {
  cardId: string
  space?: TReceiveSpace
  copies: number
}

export type TPendingReward = {
  id: string
  memberId: string
  cardId: string
  origin: TRewardOrigin
  source:
    | { type: 'randomEvent'; encounterId: string }
    | { type: 'combatEvent'; combatId: string }
    | { type: 'quest'; questId: string; questCardId: string }
    | { type: 'scavenge' }
    | { type: 'booster'; boosterCardId: string }
  destination: 'inventory' | 'tcgFolder'
  /** Uma entrada por carta e espaço (REQ-159), em ordem de `cardId` e depois principal → montaria. */
  discardOptions: { cardId: string; space: TReceiveSpace; maxCopies: number }[]
  decisionDeadlineAt: null
}

export type TRewardDelivery = Pick<TPendingReward, 'cardId' | 'origin'> & {
  rewardId: string
  disposition: 'kept' | 'returnedToDeck' | 'removed' | 'sentToLimbo'
  /** REQ-159: onde a cópia ficou; `null` quando não ficou com o jogador; ausente nos saves de antes da T-77 (D-152). */
  space?: TReceiveSpace | null
}

/** Os espaços de um destino de recompensa (REQ-159): o principal e o da montaria. */
export function rewardSpaces(
  destination: TPendingReward['destination']
): readonly [TReceiveSpace, TReceiveSpace] {
  return destination === 'inventory'
    ? ['inventory', 'mountInventory']
    : ['tcgFolder', 'mountTcgFolder']
}

export type TRewardSearch = {
  encounterId: string
  cardId: string
  found: boolean
}

export type TResolveRewardAction = {
  type: 'resolveReward'
  rewardId: string
} & ({ choice: 'leave' } | { choice: 'keep'; discard: TRewardDiscard[] })

export type TRewardRefusal =
  'staleReward' | 'rewardDoesNotFit' | 'paymentInvalid'

export function drawReserve(
  pool: readonly Readonly<TReserveDeckEntry>[],
  rng: SeededRng
): Readonly<TReserveDeckEntry> {
  const total = pool.reduce((sum, entry) => sum + BigInt(entry.weight), 0n)
  // Os pesos individuais são seguros em number, mas sua soma pode exceder 32 bits.
  let span = 1n << 32n
  let words = 1
  while (span < total) {
    span <<= 32n
    words++
  }
  const limit = span - (span % total)
  let draw: bigint
  do {
    draw = 0n
    for (let i = 0; i < words; i++)
      draw = (draw << 32n) | BigInt(rng.nextUint32())
  } while (draw >= limit)
  draw %= total
  for (const entry of pool) {
    const weight = BigInt(entry.weight)
    if (draw < weight) return entry
    draw -= weight
  }
  throw new Error('Reserva inválida')
}
