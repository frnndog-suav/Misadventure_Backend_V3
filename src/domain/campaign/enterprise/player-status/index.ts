import type {
  TActivation,
  TDuration,
  TEffectMark,
} from '@/domain/catalog/enterprise/value-objects/effect'

type TStatusDuration = Extract<
  TDuration,
  {
    kind:
      | 'untilEndOfTurn'
      | 'untilStartOfNextTurn'
      | 'forOwnTurns'
      | 'untilEndOfRound'
      | 'forRounds'
      | 'untilLeaveZone'
      | 'infinite'
      | 'untilPartyEnd'
      | 'untilEventEnd'
      | 'untilEventPhaseEnd'
      | 'untilOwnCombatTurnEnd'
      | 'forOwnCombatTurns'
      | 'forCombatCycles'
      | 'untilDamageTaken'
      | 'untilAttackMade'
      | 'untilAttackMissed'
      | 'untilAbilityUsed'
      | 'forAbilitiesUsed'
      | 'whileAbilityActive'
      | 'untilNextCombatEnd'
      | 'forCombats'
      | 'untilCombatWon'
      | 'untilKnockout'
  }
>

/** Estado de um efeito já aplicado ao jogador (REQ-103, D-99). */
export type TPlayerStatus = Readonly<{
  statusId: string
  sourceCardId: string
  effectIndex: number
  text: string
  mark: TEffectMark
  activation: readonly TActivation[]
  duration: TStatusDuration
  remaining: number | null
}>

type TTurnTransition = Readonly<{
  ownTurnEnded: boolean
  ownTurnStarted: boolean
  roundEnded: boolean
}>

export function statusAfterTurn(
  status: TPlayerStatus,
  { ownTurnEnded, ownTurnStarted, roundEnded }: TTurnTransition
): TPlayerStatus | null {
  const duration = status.duration
  switch (duration.kind) {
    case 'untilEndOfTurn':
      return ownTurnEnded ? null : status
    case 'untilStartOfNextTurn':
      return ownTurnStarted ? null : status
    case 'untilEndOfRound':
      return roundEnded ? null : status
    case 'forOwnTurns':
    case 'forRounds': {
      const boundaryReached =
        duration.kind === 'forOwnTurns' ? ownTurnEnded : roundEnded
      if (!boundaryReached || status.remaining === null) return status
      const remaining = status.remaining - 1
      return remaining <= 0 ? null : { ...status, remaining }
    }
    case 'untilLeaveZone':
    case 'infinite':
    case 'untilPartyEnd':
    case 'untilEventEnd':
    case 'untilEventPhaseEnd':
    case 'untilOwnCombatTurnEnd':
    case 'forOwnCombatTurns':
    case 'forCombatCycles':
    case 'untilDamageTaken':
    case 'untilAttackMade':
    case 'untilAttackMissed':
    case 'untilAbilityUsed':
    case 'forAbilitiesUsed':
    case 'whileAbilityActive':
    case 'untilNextCombatEnd':
    case 'forCombats':
    case 'untilCombatWon':
    case 'untilKnockout':
      return status
    default: {
      const _exhaustive: never = duration
      return _exhaustive
    }
  }
}

export function combatStatusesAfterTurn(
  statuses: readonly TPlayerStatus[],
  ownTurnEnded: boolean,
  cycleEnded: boolean
) {
  return statuses.flatMap((status) => {
    const { kind } = status.duration
    if (ownTurnEnded && kind === 'untilOwnCombatTurnEnd') return []
    if (
      (ownTurnEnded && kind === 'forOwnCombatTurns') ||
      (cycleEnded && kind === 'forCombatCycles')
    ) {
      const remaining = (status.remaining ?? 1) - 1
      return remaining > 0 ? [{ ...status, remaining }] : []
    }
    return [status]
  })
}

export function combatStatusesAfterEnd(
  statuses: readonly TPlayerStatus[],
  won: boolean
) {
  return statuses.flatMap((status) => {
    switch (status.duration.kind) {
      case 'untilOwnCombatTurnEnd':
      case 'forOwnCombatTurns':
      case 'forCombatCycles':
      case 'untilNextCombatEnd':
      case 'whileAbilityActive':
        return []
      case 'untilCombatWon':
        return won ? [] : [status]
      case 'forCombats': {
        const remaining = (status.remaining ?? status.duration.count) - 1
        return remaining > 0 ? [{ ...status, remaining }] : []
      }
      default:
        return [status]
    }
  })
}

export function statusesAfterAbility(
  statuses: readonly TPlayerStatus[],
  element:
    import('@/domain/catalog/enterprise/value-objects/card').TElement | null
) {
  return statuses.flatMap((status) => {
    if (
      status.activation.some(({ kind }) => kind === 'changeNextAbilityElement')
    )
      return []
    if (
      status.duration.kind === 'untilAbilityUsed' &&
      (status.duration.element === null || status.duration.element === element)
    )
      return []
    if (status.duration.kind === 'forAbilitiesUsed') {
      const remaining = (status.remaining ?? status.duration.count) - 1
      return remaining > 0 ? [{ ...status, remaining }] : []
    }
    return [status]
  })
}
