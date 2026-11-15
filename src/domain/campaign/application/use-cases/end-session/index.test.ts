import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'
import { EndSessionUseCase } from '.'

const BEFORE = '2026-11-14T10:00:00.000Z'
const NOW = '2026-11-14T12:00:00.000Z'

let repository: InMemoryPartiesRepository
let sut: EndSessionUseCase

describe('EndSessionUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    sut = new EndSessionUseCase(repository, fixedClock(NOW))
  })

  it('REQ-21: inSession → idle, gravado com savedAt do Clock e SessionEnded', async () => {
    const party = makeParty({
      status: 'inSession',
      savedAt: fixedClock(BEFORE).now(),
    })
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId: party.id.toString() })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.party.status).toBe('idle')
    expect(result.value.party.savedAt.toISOString()).toBe(NOW)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(result.value.party)
    const stored = await repository.findById(party.id.toString())
    expect(stored?.status).toBe('idle')
    expect(stored?.savedAt.toISOString()).toBe(NOW)
    expect(result.value.party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionEnded',
    ])
  })

  it('REQ-21: idle → PARTY_SESSION_NOT_ACTIVE e nada muda', async () => {
    const party = makeParty({
      status: 'idle',
      savedAt: fixedClock(BEFORE).now(),
    })
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId: party.id.toString() })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(PartySessionNotActiveError)
      expect(result.value.code).toBe('PARTY_SESSION_NOT_ACTIVE')
      expect(result.value.message).toBe(
        'Não há sessão em andamento neste grupo.'
      )
    }
    expect(save).not.toHaveBeenCalled()
    expect(party.status).toBe('idle')
    expect(party.savedAt.toISOString()).toBe(BEFORE)
  })

  it('REQ-21: inexistente → PARTY_NOT_FOUND', async () => {
    const result = await sut.execute({ partyId: 'nao-existe' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBeInstanceOf(PartyNotFoundError)
  })
})
