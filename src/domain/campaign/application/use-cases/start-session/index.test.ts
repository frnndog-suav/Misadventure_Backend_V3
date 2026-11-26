import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { ResumeLegacyKnockout } from '../resume-legacy-knockout'
import { StartSessionUseCase } from '.'

const BEFORE = '2026-11-14T10:00:00.000Z'
const NOW = '2026-11-14T12:00:00.000Z'

let repository: InMemoryPartiesRepository
let sut: StartSessionUseCase

describe('StartSessionUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    const catalog = new InMemoryCardCatalog()
    sut = new StartSessionUseCase(
      repository,
      fixedClock(NOW),
      new ResumeLegacyKnockout(catalog, sequentialIds()),
      catalog
    )
  })

  it('REQ-20: idle → inSession, gravado com savedAt do Clock e SessionStarted', async () => {
    const party = makeParty({
      status: 'idle',
      savedAt: fixedClock(BEFORE).now(),
    })
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId: party.id.toString() })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.party.status).toBe('inSession')
    expect(result.value.party.savedAt.toISOString()).toBe(NOW)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(result.value.party)
    const stored = await repository.findById(party.id.toString())
    expect(stored?.status).toBe('inSession')
    expect(stored?.savedAt.toISOString()).toBe(NOW)
    expect(result.value.party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionStarted',
    ])
  })

  it('REQ-20 (D-29): já inSession → inalterado, sem gravar e sem evento', async () => {
    const party = makeParty({
      status: 'inSession',
      savedAt: fixedClock(BEFORE).now(),
    })
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId: party.id.toString() })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.party.status).toBe('inSession')
    expect(result.value.party.savedAt.toISOString()).toBe(BEFORE)
    expect(save).not.toHaveBeenCalled()
    expect(result.value.party.pullDomainEvents()).toEqual([])
  })

  it('REQ-20: inexistente → PARTY_NOT_FOUND', async () => {
    const result = await sut.execute({ partyId: 'nao-existe' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBeInstanceOf(PartyNotFoundError)
  })
})
