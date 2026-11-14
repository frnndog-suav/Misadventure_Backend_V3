import { describe, expect, it } from 'vitest'

import { fixedClock } from '../../../test/fakes/fixed-clock'
import { fixedSeed } from '../../../test/fakes/fixed-seed'
import { sequentialIds } from '../../../test/fakes/sequential-ids'
import { Clock } from './clock'
import { IdGenerator } from './id-generator'
import { SeedGenerator } from './seed-generator'

// Os fakes cumprem as portas (são subclasses das classes abstratas).
describe('fakes das portas', () => {
  it('fixedClock devolve sempre o mesmo instante (cópia nova a cada chamada)', () => {
    const clock: Clock = fixedClock('2026-11-14T10:00:00.000Z')
    const first = clock.now()
    first.setFullYear(2000)

    expect(clock).toBeInstanceOf(Clock)
    expect(clock.now().toISOString()).toBe('2026-11-14T10:00:00.000Z')
  })

  it('sequentialIds gera ids em sequência, com prefixo opcional', () => {
    const ids: IdGenerator = sequentialIds()
    const prefixed = sequentialIds('party')

    expect(ids).toBeInstanceOf(IdGenerator)
    expect([ids.next(), ids.next()].map(String)).toEqual(['id-1', 'id-2'])
    expect(prefixed.next().toString()).toBe('party-1')
  })

  it('fixedSeed devolve sempre a mesma semente', () => {
    const seeds: SeedGenerator = fixedSeed(42)

    expect(seeds).toBeInstanceOf(SeedGenerator)
    expect([seeds.next(), seeds.next()]).toEqual([42, 42])
  })
})
