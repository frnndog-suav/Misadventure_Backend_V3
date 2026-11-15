import { beforeEach, describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { ListPartiesUseCase } from '.'

let repository: InMemoryPartiesRepository
let sut: ListPartiesUseCase

const at = (iso: string) => fixedClock(iso).now()

describe('ListPartiesUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    sut = new ListPartiesUseCase(repository)
  })

  it('REQ-18: sem saves → []', async () => {
    const result = await sut.execute()

    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value.parties).toEqual([])
  })

  it('REQ-18: ordena por savedAt decrescente; empate por id crescente', async () => {
    const old = makeParty(
      { savedAt: at('2026-11-14T10:00:00.000Z') },
      new UniqueEntityID('a')
    )
    const tieB = makeParty(
      { savedAt: at('2026-11-14T12:00:00.000Z') },
      new UniqueEntityID('b')
    )
    const tieA = makeParty(
      { savedAt: at('2026-11-14T12:00:00.000Z') },
      new UniqueEntityID('B')
    )
    const newest = makeParty(
      { savedAt: at('2026-11-14T13:00:00.000Z') },
      new UniqueEntityID('c')
    )
    for (const party of [old, tieB, newest, tieA])
      await repository.create(party)

    const result = await sut.execute()

    if (!result.isRight()) throw new Error('esperava sucesso')
    expect(result.value.parties.map((p) => p.id.toString())).toEqual([
      'c',
      'B',
      'b',
      'a',
    ])
  })
})
