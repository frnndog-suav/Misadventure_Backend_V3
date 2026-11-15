import type { DomainEvent } from '@/core/events/domain-event'

// Eventos do agregado `Party` (D-27), união discriminada por `type`.

export interface PartyCreatedEvent extends DomainEvent {
  readonly type: 'PartyCreated'
}

export interface SessionStartedEvent extends DomainEvent {
  readonly type: 'SessionStarted'
}

export interface SessionEndedEvent extends DomainEvent {
  readonly type: 'SessionEnded'
}

/** Registrado antes de apagar o save, para o despacho. */
export interface PartyAbandonedEvent extends DomainEvent {
  readonly type: 'PartyAbandoned'
}

export type TPartyEvent =
  | PartyCreatedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | PartyAbandonedEvent
