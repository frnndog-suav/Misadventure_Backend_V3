import { type Either, left, right } from '@/core/error/either'
import { type RngState, SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TEquipmentCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TCost,
  TQuantity,
} from '@/domain/catalog/enterprise/value-objects/effect'

import { effectiveModifiers } from '../effective-modifiers'
import { maxHealthOf, type TPlayerState } from '../entities/party-member'
import { shuffle } from '../shuffle'
import { handCount, matchingHands } from './hand-payment'

export type TPaymentRefusal = {
  reason:
    | 'notEnoughGold'
    | 'notEnoughVigor'
    | 'notEnoughLife'
    | 'notEnoughPeak'
    | 'paymentInvalid'
    | 'minimumNotMet'
  cardId?: string
}
export type TCostPaid = {
  cost: TCost['kind']
  amount?: number
  cardIds?: readonly string[]
}
export type TPayment = {
  player: TPlayerState
  paid: TCostPaid[]
  consumed: boolean
  rngState?: RngState
}

export const EXECUTABLE_COSTS = [
  'consumeSelf',
  'discardFromHand',
  'donateLife',
  'payGold',
  'spendVigor',
  'reducePeak',
] as const satisfies readonly TCost['kind'][]

type TExecutableCost = Extract<
  TCost,
  { kind: (typeof EXECUTABLE_COSTS)[number] }
>

function quantityOf(
  quantity: TQuantity,
  player: TPlayerState,
  cards: ReadonlyMap<string, TCard>
): number | null {
  if (typeof quantity === 'number') return quantity

  const equipped = Object.values(player.equipment).flatMap((id) => {
    const card = id === null ? undefined : cards.get(id)
    return card?.type === 'equipment' ? [card] : []
  })
  const countInventory = (matches: (card: TCard) => boolean) =>
    player.inventory.reduce((sum, { cardId, quantity }) => {
      const card = cards.get(cardId)
      return sum + (card && matches(card) ? quantity : 0)
    }, 0)
  const modifiers = (equipment: readonly TEquipmentCard[]) =>
    Object.values(effectiveModifiers({ ...player, equipment }))

  let base: number
  switch (quantity.base) {
    case 'equipmentInUseCount':
      base = equipped.length
      break
    case 'equipmentInInventoryCount':
      base = countInventory((card) => card.type === 'equipment')
      break
    case 'resourcesInInventoryCount':
      base = player.inventory.reduce((sum, slot) => sum + slot.quantity, 0)
      break
    case 'relicsAndDocumentsInInventoryCount':
      base = countInventory(
        (card) =>
          card.type === 'item' &&
          (card.itemCategory === 'relic' || card.itemCategory === 'document')
      )
      break
    case 'attributeDiscardCount':
      base = player.discard.length
      break
    case 'halfHealth':
      base = Math.ceil(player.health / 2)
      break
    case 'halfGold':
      base = Math.ceil(player.gold / 2)
      break
    case 'halfVigor':
      base = Math.ceil(player.vigor / 2)
      break
    case 'allVigor':
      base = player.vigor
      break
    case 'highestModifier':
      base = Math.max(...modifiers(equipped))
      break
    case 'lowestModifier':
      base = Math.min(...modifiers(equipped))
      break
    case 'perEnemy':
      base = 0
      break
    default: {
      const exhaustive: never = quantity.base
      return exhaustive
    }
  }
  const amount = base * quantity.multiplier
  return amount < quantity.minimum ? null : amount
}

function removeHandCards(
  hand: readonly string[],
  cardIds: readonly string[]
): Either<TPaymentRefusal, string[]> {
  const remaining = [...hand]
  for (const cardId of cardIds) {
    const index = remaining.indexOf(cardId)
    if (index < 0) return left({ reason: 'paymentInvalid', cardId })
    remaining.splice(index, 1)
  }
  return right(remaining)
}

const RESOURCE_COSTS = {
  donateLife: { field: 'health', refusal: 'notEnoughLife' },
  payGold: { field: 'gold', refusal: 'notEnoughGold' },
  spendVigor: { field: 'vigor', refusal: 'notEnoughVigor' },
} as const

/** A simulação usa as mesmas regras do pagamento e opera sobre cópias. */
export function payEffectCosts(
  player: TPlayerState,
  cardId: string,
  costs: readonly TExecutableCost[],
  catalog: ReadonlyMap<string, TCard>,
  request?: { handCards: readonly string[] | undefined; rngState: RngState }
): Either<TPaymentRefusal, TPayment> {
  const selectedCount = costs.reduce(
    (sum, cost) =>
      sum +
      (cost.kind === 'discardFromHand' && !cost.random ? handCount(cost) : 0),
    0
  )
  const selected = request?.handCards

  function pay(
    index: number,
    state: TPayment,
    offset: number
  ): Either<TPaymentRefusal, TPayment> {
    const cost = costs[index]
    if (!cost) {
      if (
        request &&
        (selectedCount === 0
          ? selected !== undefined
          : selected?.length !== selectedCount)
      ) {
        return left({ reason: 'paymentInvalid' })
      }
      return right(state)
    }

    const { player } = state
    const next = (
      patch: Partial<TPlayerState>,
      event: Omit<TCostPaid, 'cost'> = {},
      consumed = state.consumed,
      nextOffset = offset,
      rngState = state.rngState
    ) =>
      pay(
        index + 1,
        {
          player: { ...player, ...patch },
          paid: [...state.paid, { cost: cost.kind, ...event }],
          consumed,
          rngState,
        },
        nextOffset
      )

    switch (cost.kind) {
      case 'consumeSelf': {
        const position = player.inventory.findIndex(
          (slot) => slot.cardId === cardId
        )
        if (position < 0 || state.consumed)
          return left({ reason: 'paymentInvalid', cardId })
        const inventory = player.inventory.flatMap((slot, i) => {
          if (i !== position) return [slot]
          return slot.quantity > 1
            ? [{ ...slot, quantity: slot.quantity - 1 }]
            : []
        })
        return next({ inventory }, { cardIds: [cardId] }, true)
      }
      case 'discardFromHand': {
        const count = handCount(cost)
        const spend = (
          cardIds: readonly string[],
          rngState = state.rngState
        ) => {
          const hand = removeHandCards(player.hand, cardIds)
          return hand.isLeft()
            ? left<TPaymentRefusal, TPayment>(hand.value)
            : next(
                { hand: hand.value, discard: [...player.discard, ...cardIds] },
                { cardIds },
                state.consumed,
                offset + (cost.random ? 0 : count),
                rngState
              )
        }
        if (request && !cost.random) {
          const choice = selected?.slice(offset, offset + count)
          if (!choice || choice.length !== count)
            return left({ reason: 'paymentInvalid' })
          const hand = removeHandCards(player.hand, choice)
          if (hand.isLeft()) return left(hand.value)
          if (matchingHands(cost, choice, catalog).next().done) {
            return left({
              reason: 'paymentInvalid',
              ...(choice.length === 1 ? { cardId: choice[0] } : {}),
            })
          }
          return spend(choice)
        }
        const rng =
          state.rngState === undefined
            ? null
            : SeededRng.fromState(state.rngState)
        const candidates = rng ? shuffle(player.hand, rng) : player.hand
        const rngState = rng?.state()
        const hasLaterDiscard = costs
          .slice(index + 1)
          .some((entry) => entry.kind === 'discardFromHand')
        let failure: TPaymentRefusal | undefined
        for (const choice of matchingHands(cost, candidates, catalog)) {
          const result = spend(choice, rngState)
          if (result.isRight() || !hasLaterDiscard) return result
          failure ??= result.value
        }
        return left(failure ?? { reason: 'paymentInvalid' })
      }
      case 'reducePeak': {
        const amount =
          cost.amount ?? Math.floor((player.peak * (cost.percent ?? 0)) / 100)
        if (amount > player.peak) return left({ reason: 'notEnoughPeak' })
        const peak = player.peak - amount
        return next(
          {
            peak,
            vigor: Math.min(player.vigor, peak),
            health: Math.min(player.health, maxHealthOf({ ...player, peak })),
          },
          { amount }
        )
      }
      case 'payGold':
      case 'spendVigor':
      case 'donateLife': {
        const amount = quantityOf(cost.amount, player, catalog)
        if (amount === null) return left({ reason: 'minimumNotMet' })
        const { field, refusal } = RESOURCE_COSTS[cost.kind]
        if (
          amount > player[field] ||
          (cost.kind === 'spendVigor' && player.vigor === 0)
        ) {
          return left({ reason: refusal })
        }
        return next({ [field]: player[field] - amount }, { amount })
      }
      default: {
        const exhaustive: never = cost
        return exhaustive
      }
    }
  }

  return pay(
    0,
    { player, paid: [], consumed: false, rngState: request?.rngState },
    0
  )
}
