import { type Either, left, right } from '@/core/error/either'
import type { RngState } from '@/core/rng/seeded-rng'
import {
  EQUIPMENT_SLOTS,
  type TCard,
  type TEquipmentCard,
  type TItemCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TActivation,
  TCost,
  TEffect,
  TEventPhase,
} from '@/domain/catalog/enterprise/value-objects/effect'

import { equipmentWorks } from '../effective-modifiers'
import {
  EXECUTABLE_COSTS,
  payEffectCosts,
  type TPayment,
  type TPaymentRefusal,
} from '../effect-payment'
import { describeHandPayment } from '../effect-payment/hand-payment'
import type { TPlayerState } from '../entities/party-member'
import type { TActivateOperation } from '../party-action'
import type { TPlayerStatus } from '../player-status'

const ACTIVATIONS = [
  'gainGold',
  'loseGold',
  'heal',
  'loseLife',
  'restoreVigor',
  'gainPeak',
  'keepPeakOnKnockout',
  'modifierFlat',
  'modifierPercent',
  'drawCards',
  'removeDebuffs',
  'removeBuffs',
  'fleeTargetOverride',
  'fleeTargetModifier',
  'diceResultModifier',
] as const satisfies readonly TActivation['kind'][]

function isEventRuleActivation(entry: TActivation): boolean {
  return (
    entry.kind === 'fleeTargetOverride' ||
    entry.kind === 'fleeTargetModifier' ||
    entry.kind === 'diceResultModifier'
  )
}

const DURATIONS = [
  'untilEndOfTurn',
  'untilStartOfNextTurn',
  'forOwnTurns',
  'untilEndOfRound',
  'forRounds',
  'untilLeaveZone',
  'infinite',
  'untilPartyEnd',
  'untilEventEnd',
  'untilEventPhaseEnd',
  'untilKnockout',
] as const satisfies readonly TPlayerStatus['duration']['kind'][]

function hasKind<const T extends string>(
  kinds: readonly T[],
  kind: string
): kind is T {
  return (kinds as readonly string[]).includes(kind)
}

export type TExecutableActivation = Extract<
  TActivation,
  { kind: (typeof ACTIVATIONS)[number] }
>
export function isExecutableActivation(
  entry: TActivation
): entry is TExecutableActivation {
  return (
    hasKind(ACTIVATIONS, entry.kind) &&
    ((entry.kind !== 'removeBuffs' && entry.kind !== 'removeDebuffs') ||
      entry.target === 'self')
  )
}

export function isStatusDuration(
  value: TEffect['duration']
): value is TPlayerStatus['duration'] {
  return hasKind(DURATIONS, value.kind)
}
type TExecutableCost = Extract<
  TCost,
  { kind: (typeof EXECUTABLE_COSTS)[number] }
>
type TExecutableEffect = Omit<TEffect, 'cost' | 'activation' | 'duration'> & {
  cost: readonly TExecutableCost[]
  activation: readonly TExecutableActivation[]
  duration: TPlayerStatus['duration'] | { kind: 'immediate' }
}

type TSource = {
  source: 'inventory' | 'equipment'
  card: TItemCard | TEquipmentCard
}
export type TActivateRefusal =
  | TPaymentRefusal
  | {
      reason:
        | 'notOwned'
        | 'peakRequirementNotMet'
        | 'equipmentNotInUse'
        | 'effectNotFound'
        | 'notActivatable'
        | 'notActivatableYet'
      cardId?: string
    }
export type TActivatableEffect = {
  cardId: string
  effectIndex: number
  source: TSource['source']
  handPayment: ReturnType<typeof handPayment>
}

export function handPayment(effect: TEffect) {
  return describeHandPayment(
    effect.cost.filter((cost) => cost.kind === 'discardFromHand')
  )
}

function resolveEffect(
  player: TPlayerState,
  { card, source }: TSource,
  effectIndex: number,
  phase?: TEventPhase
): Either<TActivateRefusal, TExecutableEffect> {
  if (
    card.type === 'equipment' &&
    source === 'equipment' &&
    !equipmentWorks(card, player.peak)
  ) {
    return left({ reason: 'peakRequirementNotMet' })
  }
  if (card.type === 'equipment' && source === 'inventory') {
    return left({ reason: 'equipmentNotInUse' })
  }
  const effect = card.effects[effectIndex]
  if (!effect) return left({ reason: 'effectNotFound' })
  if (effect.trigger !== null || effect.cost.length === 0) {
    return left({ reason: 'notActivatable' })
  }
  const { cost, activation, duration } = effect
  if (
    !cost.every((entry): entry is TExecutableCost =>
      hasKind(EXECUTABLE_COSTS, entry.kind)
    ) ||
    !activation.every(isExecutableActivation) ||
    (phase === undefined && activation.some(isEventRuleActivation))
  ) {
    return left({ reason: 'notActivatableYet' })
  }
  if (duration.kind === 'immediate') {
    if (
      activation.some(
        ({ kind }) =>
          kind === 'modifierFlat' ||
          kind === 'modifierPercent' ||
          kind === 'keepPeakOnKnockout'
      ) ||
      activation.some(isEventRuleActivation)
    ) {
      return left({ reason: 'notActivatableYet' })
    }
    return right({ ...effect, cost, activation, duration })
  }
  if (!isStatusDuration(duration) || effect.mark === null) {
    return left({ reason: 'notActivatableYet' })
  }
  if (
    (duration.kind === 'untilEventEnd' && phase === undefined) ||
    (duration.kind === 'untilEventPhaseEnd' && phase !== duration.phase)
  ) {
    return left({ reason: 'notActivatable' })
  }
  return right({ ...effect, cost, activation, duration })
}

/** Lista em ordem de inventário e depois de equipamento (REQ-101). */
export function activatableEffects(
  player: TPlayerState,
  cards: readonly TCard[],
  phase?: TEventPhase
): TActivatableEffect[] {
  const catalog = new Map(cards.map((card) => [card.id, card]))
  const seen = new Set<string>()
  const available: TActivatableEffect[] = []
  const add = (cardId: string, source: TSource['source']) => {
    const card = catalog.get(cardId)
    if (
      (card?.type !== 'item' && card?.type !== 'equipment') ||
      seen.has(cardId)
    )
      return
    seen.add(cardId)
    for (const [effectIndex] of card.effects.entries()) {
      const effect = resolveEffect(player, { card, source }, effectIndex, phase)
      if (
        effect.isLeft() ||
        payEffectCosts(player, cardId, effect.value.cost, catalog).isLeft()
      )
        continue
      available.push({
        cardId,
        effectIndex,
        source,
        handPayment: handPayment(effect.value),
      })
    }
  }
  for (const { cardId } of player.inventory) {
    if (!Object.values(player.equipment).includes(cardId))
      add(cardId, 'inventory')
  }
  for (const slot of EQUIPMENT_SLOTS) {
    const cardId = player.equipment[slot]
    if (cardId !== null) add(cardId, 'equipment')
  }
  return available
}

export function prepareEffect(
  player: TPlayerState,
  operation: TActivateOperation,
  cards: readonly TCard[],
  rngState: RngState,
  phase?: TEventPhase
): Either<TActivateRefusal, TPayment & { effect: TExecutableEffect }> {
  const { cardId, effectIndex } = operation
  const inUse = Object.values(player.equipment).includes(cardId)
  const catalog = new Map(cards.map((card) => [card.id, card]))
  const card = catalog.get(cardId)
  if (
    (!inUse && !player.inventory.some((slot) => slot.cardId === cardId)) ||
    (card?.type !== 'item' && card?.type !== 'equipment')
  ) {
    return left({ reason: 'notOwned', cardId })
  }
  const effect = resolveEffect(
    player,
    { card, source: inUse ? 'equipment' : 'inventory' },
    effectIndex,
    phase
  )
  if (effect.isLeft()) return left(effect.value)
  const payment = payEffectCosts(player, cardId, effect.value.cost, catalog, {
    handCards: operation.payment?.handCards,
    rngState,
  })
  if (payment.isLeft()) return left(payment.value)
  return right({ ...payment.value, effect: effect.value })
}
