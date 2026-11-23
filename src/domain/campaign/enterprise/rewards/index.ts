import type { SeededRng } from '@/core/rng/seeded-rng'
import type { TZoneType } from '@/domain/catalog/enterprise/value-objects/card'
import type { TReserveDeckEntry } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

export type TRewardOrigin =
  | { type: 'rewardDeck'; zoneType: TZoneType }
  | { type: 'reserveDeck' }
  | { type: 'fixed' }

export type TRewardDiscard = { cardId: string; copies: number }

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
  discardOptions: { cardId: string; maxCopies: number }[]
  decisionDeadlineAt: null
}

export type TRewardDelivery = Pick<TPendingReward, 'cardId' | 'origin'> & {
  rewardId: string
  disposition: 'kept' | 'returnedToDeck' | 'removed' | 'sentToLimbo'
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
