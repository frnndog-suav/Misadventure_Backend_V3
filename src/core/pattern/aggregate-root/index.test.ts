import { describe, expect, it } from 'vitest'

import { fixedClock } from '../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../test/fakes/sequential-ids'

import { UniqueEntityID } from '../../entities/unique-entity-id'
import type { DomainEvent } from '../../events/domain-event'
import { AggregateRoot } from '.'

type CounterEvent = DomainEvent & { type: 'Incremented' | 'Reset' }

class Counter extends AggregateRoot<{ value: number }, CounterEvent> {
  static create(id: UniqueEntityID) {
    return new Counter({ value: 0 }, id)
  }

  increment(at: Date) {
    this.props.value += 1
    this.addDomainEvent({
      type: 'Incremented',
      occurredAt: at,
      aggregateId: this.id,
    })
  }

  reset(at: Date) {
    this.props.value = 0
    this.addDomainEvent({ type: 'Reset', occurredAt: at, aggregateId: this.id })
  }
}

describe('AggregateRoot', () => {
  it('registra os eventos na ordem em que acontecem', () => {
    const clock = fixedClock('2026-11-14T12:00:00.000Z')
    const counter = Counter.create(sequentialIds().next())

    counter.increment(clock.now())
    counter.reset(clock.now())
    counter.increment(clock.now())

    const events = counter.pullDomainEvents()
    expect(events.map((event) => event.type)).toEqual([
      'Incremented',
      'Reset',
      'Incremented',
    ])
    expect(events[0].aggregateId.equals(counter.id)).toBe(true)
    expect(events[0].occurredAt.toISOString()).toBe('2026-11-14T12:00:00.000Z')
  })

  it('pullDomainEvents devolve e limpa a lista', () => {
    const counter = Counter.create(new UniqueEntityID('c'))
    counter.increment(fixedClock().now())

    expect(counter.pullDomainEvents()).toHaveLength(1)
    expect(counter.pullDomainEvents()).toEqual([])
  })
})
