import { beforeEach, describe, expect, it } from 'vitest'

import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { AbandonPartyUseCase } from '.'

let repository: InMemoryPartiesRepository
let sut: AbandonPartyUseCase

describe('AbandonPartyUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    sut = new AbandonPartyUseCase(repository, fixedClock())
  })

  it.each(['idle', 'inSession'] as const)(
    'REQ-24: apaga o save (%s) e registra PartyAbandoned',
    async (status) => {
      const party = makeParty({ status })
      await repository.create(party)

      const result = await sut.execute({ partyId: party.id.toString() })

      expect(result.isRight()).toBe(true)
      expect(await repository.findById(party.id.toString())).toBeNull()
      expect(await repository.findAll()).toEqual([])
      if (result.isRight())
        expect(
          result.value.party.pullDomainEvents().map((e) => e.type)
        ).toEqual(['PartyAbandoned'])
    }
  )

  it('REQ-24: inexistente → PARTY_NOT_FOUND', async () => {
    const result = await sut.execute({ partyId: 'nao-existe' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBeInstanceOf(PartyNotFoundError)
  })
})
