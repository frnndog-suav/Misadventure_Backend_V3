import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { DomainEvent } from '@/core/events/domain-event'

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

/** Registrado antes de apagar o save, para o despacho. */
export interface PartyAbandonedEvent extends DomainEvent {
  readonly type: 'PartyAbandoned'
}

export type TPartyEvent =
  | PartyCreatedEvent
  | MapAssembledEvent
  | StarterDeckGivenEvent
  | TurnOrderDecidedEvent
  | PlayersArrivedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | PlayerMovedEvent
  | PartyAbandonedEvent
