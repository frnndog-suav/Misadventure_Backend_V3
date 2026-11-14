import type { UniqueEntityID } from '../../entities/unique-entity-id'

/** Fato do domínio registrado por um agregado. Cada contexto define a união discriminada por `type`. */
export interface DomainEvent {
  readonly type: string
  readonly occurredAt: Date
  readonly aggregateId: UniqueEntityID
}
