import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TActivationApplied } from '../../effect-activation'
import type { TCostPaid } from '../../effect-payment'
import type { DomainEvent } from '@/core/events/domain-event'
import type {
  TEquipmentSlot,
  TPlayerClass,
} from '@/domain/catalog/enterprise/value-objects/card'

import type { TRecoverOption } from '../../party-action'

// Eventos do agregado `Party` (D-27), união discriminada por `type`.

export interface PartyCreatedEvent extends DomainEvent {
  readonly type: 'PartyCreated'
}

/** Preparação (README 10.1; REQ-31): mapa montado. */
export interface MapAssembledEvent extends DomainEvent {
  readonly type: 'MapAssembled'
}

/** Preparação: deck pré-pronto entregue a um membro (um por membro). */
export interface StarterDeckGivenEvent extends DomainEvent {
  readonly type: 'StarterDeckGiven'
  readonly memberId: UniqueEntityID
}

/** Preparação: ordem dos jogadores decidida (README 11.2). */
export interface TurnOrderDecidedEvent extends DomainEvent {
  readonly type: 'TurnOrderDecided'
}

/** Preparação: todos chegaram à cidade inicial (README 20.1). */
export interface PlayersArrivedEvent extends DomainEvent {
  readonly type: 'PlayersArrived'
}

export interface SessionStartedEvent extends DomainEvent {
  readonly type: 'SessionStarted'
}

export interface SessionEndedEvent extends DomainEvent {
  readonly type: 'SessionEnded'
}

/** Movimentar (README 12.2; REQ-51). */
export interface PlayerMovedEvent extends DomainEvent {
  readonly type: 'PlayerMoved'
  readonly memberId: UniqueEntityID
  readonly fromZoneId: string
  readonly toZoneId: string
}

/** Uma vez começou (REQ-55 na criação, REQ-57 ao encerrar a anterior). */
export interface TurnStartedEvent extends DomainEvent {
  readonly type: 'TurnStarted'
  readonly memberId: UniqueEntityID
  readonly round: number
}

/** A vez de `memberId` na `round` acabou (REQ-57). */
export interface TurnEndedEvent extends DomainEvent {
  readonly type: 'TurnEnded'
  readonly memberId: UniqueEntityID
  readonly round: number
}

/** Recuperar (README 12.5; REQ-63): valores efetivos, depois dos tetos. */
export interface PlayerRecoveredEvent extends DomainEvent {
  readonly type: 'PlayerRecovered'
  readonly memberId: UniqueEntityID
  readonly option: TRecoverOption
  readonly healthRestored: number
  readonly vigorRestored: number
  readonly cardsDrawn: number
}

/** Ajustar deck (README 4.4; REQ-65): `handSize` é a mão comprada de novo. */
export interface DeckAdjustedEvent extends DomainEvent {
  readonly type: 'DeckAdjusted'
  readonly memberId: UniqueEntityID
  readonly buildSize: number
  readonly handSize: number
}

/** A trava de uma classe mudou com o ajuste do deck (README 8.2; REQ-65). */
export interface DeckLockChangedEvent extends DomainEvent {
  readonly type: 'DeckLockChanged'
  readonly memberId: UniqueEntityID
  readonly playerClass: TPlayerClass
  readonly deckLockMet: boolean
}

/** Preparar: um equipamento saiu do slot para o inventário (REQ-72, REQ-73). */
export interface EquipmentUnequippedEvent extends DomainEvent {
  readonly type: 'EquipmentUnequipped'
  readonly memberId: UniqueEntityID
  readonly cardId: string
  readonly slot: TEquipmentSlot
}

/** Preparar: um equipamento entrou em uso (REQ-72). */
export interface EquipmentEquippedEvent extends DomainEvent {
  readonly type: 'EquipmentEquipped'
  readonly memberId: UniqueEntityID
  readonly cardId: string
  readonly slot: TEquipmentSlot
}

/** Doação do laboratório (REQ-77, D-78); no ouro, o que entrou e o que se perdeu (REQ-76). */
export interface LabGrantAppliedEvent extends DomainEvent {
  readonly type: 'LabGrantApplied'
  readonly memberId: UniqueEntityID
  readonly grant:
    | { type: 'card'; cardId: string; quantity: number }
    | { type: 'gold'; amount: number; received: number; lost: number }
}

/** Usar cofre aceito (README 12.2; REQ-84); as operações vêm nos eventos seguintes. */
export interface VaultUsedEvent extends DomainEvent {
  readonly type: 'VaultUsed'
  readonly memberId: UniqueEntityID
  readonly operationCount: number
}

/** Carta destruída pelo Descartar do cofre (README 6.5; REQ-86); nada volta do limbo. */
export interface SentToLimboEvent extends DomainEvent {
  readonly type: 'SentToLimbo'
  readonly memberId: UniqueEntityID
  readonly cardId: string
  readonly quantity: number
  readonly from: 'vault' | 'inventory' | 'equipment'
}

/** Vasculhar aceito (README 12.6; REQ-91): `found` diz se a carta saiu do deck. */
export interface ScavengedEvent extends DomainEvent {
  readonly type: 'Scavenged'
  readonly memberId: UniqueEntityID
  readonly zoneId: string
  readonly cardId: string
  readonly found: boolean
}

/** Registrado antes de apagar o save, para o despacho. */
export interface PartyAbandonedEvent extends DomainEvent {
  readonly type: 'PartyAbandoned'
}

export interface StatusExpiredEvent extends DomainEvent {
  readonly type: 'StatusExpired'
  readonly memberId: UniqueEntityID
  readonly statusId: string
}

type TEffectEvent = DomainEvent & { readonly memberId: UniqueEntityID } & (
    | {
        readonly type: 'EffectActivated'
        readonly cardId: string
        readonly effectIndex: number
      }
    | ({ readonly type: 'EffectCostPaid' } & Readonly<TCostPaid>)
    | ({
        readonly type: 'EffectActivationApplied'
      } & Readonly<TActivationApplied>)
    | { readonly type: 'StatusApplied'; readonly statusId: string }
  )

export type TPartyEvent =
  | PartyCreatedEvent
  | MapAssembledEvent
  | StarterDeckGivenEvent
  | TurnOrderDecidedEvent
  | PlayersArrivedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | PlayerMovedEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | PlayerRecoveredEvent
  | DeckAdjustedEvent
  | DeckLockChangedEvent
  | EquipmentUnequippedEvent
  | EquipmentEquippedEvent
  | LabGrantAppliedEvent
  | VaultUsedEvent
  | SentToLimboEvent
  | ScavengedEvent
  | StatusExpiredEvent
  | TEffectEvent
  | PartyAbandonedEvent
