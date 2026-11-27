import type { TCombatUpdate } from '../combat'
import type { TEventResult } from '../random-event'

export type TAutomaticTurnEvent =
  | { type: 'turnStarted'; payload: { zoneId: string; actionPoints: number } }
  | {
      type: 'turnEnded'
      payload: { reason: 'passed' | 'dimensionChanged' | 'frozen' }
    }
  | {
      type: 'moved'
      payload: { fromZoneId: string; traversedZoneIds: string[] }
    }
  | {
      type: 'randomEventStarted'
      payload: { encounterId: string; zoneId: string }
    }
  | {
      type: 'randomEventRevealed'
      payload: { encounterId: string; cardId: string; cardTitle: string }
    }
  | {
      type: 'randomEventPhaseChanged'
      payload: { encounterId: string; phase: 'success' | 'setback' }
    }
  | {
      type: 'randomEventEnded'
      payload: Pick<
        TEventResult,
        'encounterId' | 'cardId' | 'resolution' | 'cause'
      >
    }
  | {
      type: 'combatUpdated'
      payload: { update: TCombatUpdate; combatUpdateIndex: number }
    }

export type TPublicDomainEvent = TAutomaticTurnEvent & {
  id: string
  memberId: string
  dimensionId: string
  round: number
}
