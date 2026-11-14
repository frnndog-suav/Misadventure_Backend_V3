import { Entity } from '../../entities/entity'
import type { DomainEvent } from '../../events/domain-event'

/**
 * Raiz de agregado (Constituição 4): registra seus eventos na ordem em que
 * acontecem e os entrega com `pullDomainEvents()`. O despacho é do infra.
 */
export abstract class AggregateRoot<
  Props,
  Event extends DomainEvent = DomainEvent,
> extends Entity<Props> {
  private domainEvents: Event[] = []

  protected addDomainEvent(event: Event): void {
    this.domainEvents.push(event)
  }

  /** Devolve os eventos registrados e limpa a lista. */
  pullDomainEvents(): Event[] {
    const events = this.domainEvents
    this.domainEvents = []
    return events
  }
}
