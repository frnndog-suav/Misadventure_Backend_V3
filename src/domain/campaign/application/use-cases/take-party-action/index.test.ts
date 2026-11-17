import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PartyMember } from '../../../enterprise/entities/party-member'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { ActionInvalidError } from '../_errors/action-invalid-error'
import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'
import { PartyNotFoundError } from '../_errors/party-not-found-error'
import { PartySessionNotActiveError } from '../_errors/party-session-not-active-error'
import { TakePartyActionUseCase } from '.'

const BEFORE = '2026-11-17T10:00:00.000Z'
const NOW = '2026-11-17T12:00:00.000Z'
const HARBOR = 'fixture.gray-harbor'
const MINE = 'fixture.old-mine'

const dimension = {
  dimensionCardId: 'fixture.test-dimension',
  startingCityZoneId: HARBOR,
  map: {
    zones: [
      { zoneId: HARBOR, x: 0, y: 0, arrows: ['east'] as const },
      { zoneId: MINE, x: 1, y: 0, arrows: ['west'] as const },
      { zoneId: 'fixture.island', x: 5, y: 5, arrows: [] as const },
    ],
    crossings: [{ zoneIds: [HARBOR, MINE] as const }],
  },
}

let repository: InMemoryPartiesRepository
let sut: TakePartyActionUseCase

async function seed(status: 'idle' | 'inSession' = 'inSession') {
  const party = makeParty({
    status,
    dimension,
    savedAt: fixedClock(BEFORE).now(),
  })
  await repository.create(party)
  return party.id.toString()
}

describe('TakePartyActionUseCase', () => {
  beforeEach(() => {
    repository = new InMemoryPartiesRepository()
    sut = new TakePartyActionUseCase(repository, fixedClock(NOW))
  })

  it('REQ-51: move aceito → zoneId novo, gravado com savedAt do Clock e PlayerMoved do host', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: MINE },
    })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const { party } = result.value
    expect(party.members[0].player.zoneId).toBe(MINE)
    expect(party.savedAt.toISOString()).toBe(NOW)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.zoneId).toBe(MINE)
    expect(stored?.savedAt.toISOString()).toBe(NOW)
    const events = party.pullDomainEvents()
    expect(events.map((e) => e.type)).toEqual(['PlayerMoved'])
    const moved = events[0]
    if (moved.type !== 'PlayerMoved') throw new Error('evento errado')
    expect(moved.memberId.equals(party.hostMemberId)).toBe(true)
  })

  it('REQ-51: mover de novo na sequência, inclusive de volta, é aceito', async () => {
    const partyId = await seed()

    await sut.execute({ partyId, body: { type: 'move', zoneId: MINE } })
    const back = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: HARBOR },
    })

    expect(back.isRight()).toBe(true)
    const stored = await repository.findById(partyId)
    expect(stored?.members[0].player.zoneId).toBe(HARBOR)
  })

  it('REQ-53: grupo inexistente → PARTY_NOT_FOUND, mesmo com corpo inválido', async () => {
    const result = await sut.execute({ partyId: 'nao-existe', body: [1] })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBeInstanceOf(PartyNotFoundError)
  })

  it('REQ-53: corpo malformado → ACTION_INVALID com details.fields, e nada é gravado', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: 3, speed: 2 },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(ActionInvalidError)
      expect(result.value.code).toBe('ACTION_INVALID')
      expect(result.value.message).toBe('Ação inválida.')
      expect(result.value.details).toEqual({
        fields: [
          { field: 'zoneId', reason: 'notString' },
          { field: 'speed', reason: 'unknownKey' },
        ],
      })
    }
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-53: corpo inválido vem antes do estado do grupo (idle + corpo ruim → 400)', async () => {
    const partyId = await seed('idle')

    const result = await sut.execute({ partyId, body: {} })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBeInstanceOf(ActionInvalidError)
  })

  it('REQ-53: grupo idle → PARTY_SESSION_NOT_ACTIVE, antes de conferir a zona; nada é gravado', async () => {
    const partyId = await seed('idle')
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: 'fixture.nowhere' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(PartySessionNotActiveError)
      expect(result.value.code).toBe('PARTY_SESSION_NOT_ACTIVE')
    }
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-52: zona fora do mapa → ACTION_INVALID zoneNotInMap; nada é gravado', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: 'fixture.nowhere' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(ActionInvalidError)
      expect(result.value.details).toEqual({
        fields: [{ field: 'zoneId', reason: 'zoneNotInMap' }],
      })
    }
    expect(save).not.toHaveBeenCalled()
    const stored = await repository.findById(partyId)
    expect(stored?.savedAt.toISOString()).toBe(BEFORE)
  })

  it('REQ-56: três moves gastam 3 pontos; o 4º → ACTION_NOT_ALLOWED noActionPoints, nada gravado', async () => {
    const partyId = await seed()
    for (const zoneId of [MINE, HARBOR, MINE]) {
      const moved = await sut.execute({
        partyId,
        body: { type: 'move', zoneId },
      })
      expect(moved.isRight()).toBe(true)
    }
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'move', zoneId: HARBOR },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(ActionNotAllowedError)
      expect(result.value.code).toBe('ACTION_NOT_ALLOWED')
      expect(result.value.details).toEqual({ reason: 'noActionPoints' })
    }
    expect(save).not.toHaveBeenCalled()
    const stored = await repository.findById(partyId)
    expect(stored?.turn.actionPoints).toBe(0)
    expect(stored?.members[0].player.zoneId).toBe(MINE)
  })

  it('REQ-56: o ponto gasto fica gravado', async () => {
    const partyId = await seed()

    await sut.execute({ partyId, body: { type: 'move', zoneId: MINE } })

    const stored = await repository.findById(partyId)
    expect(stored?.turn.actionPoints).toBe(2)
  })

  it('REQ-57: endTurn aceito → próxima vez, gravado com savedAt do Clock, TurnEnded e TurnStarted', async () => {
    const partyId = await seed()
    await sut.execute({ partyId, body: { type: 'move', zoneId: MINE } })
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId, body: { type: 'endTurn' } })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const { party } = result.value
    expect(party.turn.round).toBe(2)
    expect(party.turn.actionPoints).toBe(3)
    expect(party.savedAt.toISOString()).toBe(NOW)
    expect(save).toHaveBeenCalledTimes(1)
    const stored = await repository.findById(partyId)
    expect(stored?.turn.round).toBe(2)
    expect(stored?.savedAt.toISOString()).toBe(NOW)
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'TurnEnded',
      'TurnStarted',
    ])
  })

  it('REQ-59: turn gravado e lido igual; encerrar e continuar a sessão não muda turn', async () => {
    const partyId = await seed()
    await sut.execute({ partyId, body: { type: 'endTurn' } })
    await sut.execute({ partyId, body: { type: 'move', zoneId: MINE } })

    const stored = await repository.findById(partyId)
    if (!stored) throw new Error('esperava save')
    const turn = stored.turn
    expect(turn.round).toBe(2)
    expect(turn.actionPoints).toBe(2)
    stored.endSession(fixedClock(NOW).now())
    stored.startSession(fixedClock(NOW).now())
    await repository.save(stored)

    const again = await repository.findById(partyId)
    expect(again?.turn).toEqual(turn)
  })

  it('REQ-57 (K2): endTurn é aceito com 0 pontos', async () => {
    const partyId = await seed()
    for (const zoneId of [MINE, HARBOR, MINE]) {
      await sut.execute({ partyId, body: { type: 'move', zoneId } })
    }

    const result = await sut.execute({ partyId, body: { type: 'endTurn' } })

    expect(result.isRight()).toBe(true)
  })

  it('REQ-57: endTurn com campo a mais → ACTION_INVALID unknownKey; nada gravado', async () => {
    const partyId = await seed()
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({
      partyId,
      body: { type: 'endTurn', zoneId: MINE },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value).toBeInstanceOf(ActionInvalidError)
      expect(result.value.details).toEqual({
        fields: [{ field: 'zoneId', reason: 'unknownKey' }],
      })
    }
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-57: endTurn em grupo idle → PARTY_SESSION_NOT_ACTIVE; nada gravado', async () => {
    const partyId = await seed('idle')
    const save = vi.spyOn(repository, 'save')

    const result = await sut.execute({ partyId, body: { type: 'endTurn' } })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toBeInstanceOf(PartySessionNotActiveError)
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-56 (D-63): o ator é o membro da vez, não o host', async () => {
    const base = makeParty()
    const host = base.members[0]
    const other = PartyMember.create(
      { characterName: 'Bo', kind: 'human', player: host.player },
      new UniqueEntityID('member-2')
    )
    const party = makeParty({
      status: 'inSession',
      dimension,
      members: [host, other],
      hostMemberId: host.id,
      turnOrder: [other.id, host.id],
    })
    await repository.create(party)

    await sut.execute({
      partyId: party.id.toString(),
      body: { type: 'move', zoneId: MINE },
    })

    const stored = await repository.findById(party.id.toString())
    expect(stored?.members[0].player.zoneId).toBe(HARBOR)
    expect(stored?.members[1].player.zoneId).toBe(MINE)
  })

  it.each([
    ['zona do mapa sem travessia', 'fixture.island'],
    ['a própria zona atual', HARBOR],
  ])(
    'REQ-52: %s → ACTION_NOT_ALLOWED notConnected; nada é gravado',
    async (_n, zoneId) => {
      const partyId = await seed()
      const save = vi.spyOn(repository, 'save')

      const result = await sut.execute({
        partyId,
        body: { type: 'move', zoneId },
      })

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value).toBeInstanceOf(ActionNotAllowedError)
        expect(result.value.code).toBe('ACTION_NOT_ALLOWED')
        expect(result.value.message).toBe('Esta ação não é permitida agora.')
        expect(result.value.details).toEqual({ reason: 'notConnected' })
      }
      expect(save).not.toHaveBeenCalled()
      const stored = await repository.findById(partyId)
      expect(stored?.members[0].player.zoneId).toBe(HARBOR)
      expect(stored?.savedAt.toISOString()).toBe(BEFORE)
    }
  )
})
