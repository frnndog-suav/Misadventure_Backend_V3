import { beforeEach, describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { ResumeLegacyKnockout } from '../resume-legacy-knockout'
import { GetPartyUseCase } from '.'

let repository: InMemoryPartiesRepository
let sut: GetPartyUseCase

describe('GetPartyUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    sut = new GetPartyUseCase(
      repository,
      fixedClock(),
      new ResumeLegacyKnockout(new InMemoryCardCatalog(), sequentialIds())
    )
  })

  it('REQ-19: devolve o grupo existente', async () => {
    const party = makeParty()
    await repository.create(party)

    const result = await sut.execute({ partyId: party.id.toString() })

    expect(result.isRight()).toBe(true)
    if (result.isRight())
      expect(result.value.party.id.equals(party.id)).toBe(true)
  })

  it('REQ-19: inexistente → PARTY_NOT_FOUND', async () => {
    const result = await sut.execute({ partyId: 'nao-existe' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(PartyNotFoundError)
      expect(result.value.code).toBe('PARTY_NOT_FOUND')
      expect(result.value.message).toBe('Grupo não encontrado.')
    }
  })

  it('REQ-22: lido é igual ao gravado e o próximo sorteio é o mesmo', async () => {
    const rng = SeededRng.fromSeed(7)
    for (let i = 0; i < 5; i++) rng.nextUint32()
    const party = makeParty({ status: 'inSession', rngState: rng.state() })
    await repository.create(party)

    const result = await sut.execute({ partyId: party.id.toString() })
    if (!result.isRight()) throw new Error('esperava sucesso')
    const read = result.value.party

    expect(read).not.toBe(party)
    expect(read.id.equals(party.id)).toBe(true)
    expect(read.name).toBe(party.name)
    expect(read.status).toBe(party.status)
    expect(read.members.map((m) => [m.id.toString(), m.characterName])).toEqual(
      party.members.map((m) => [m.id.toString(), m.characterName])
    )
    expect(read.hostMemberId.equals(party.hostMemberId)).toBe(true)
    expect(read.createdAt.toISOString()).toBe(party.createdAt.toISOString())
    expect(read.savedAt.toISOString()).toBe(party.savedAt.toISOString())
    expect(read.config).toEqual(party.config)
    expect(read.rngState).toEqual(party.rngState)
    expect(SeededRng.fromState(read.rngState).nextUint32()).toBe(
      rng.nextUint32()
    )
  })
})
