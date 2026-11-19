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
      return status
    default: {
      const _exhaustive: never = duration
      return _exhaustive
    }
  }
}
