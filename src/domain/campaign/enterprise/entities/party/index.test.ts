import { describe, expect, it } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

import { Party, type TCreatePartyInput } from '.'

const NOW = fixedClock('2026-11-14T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-14T13:00:00.000Z').now()

function input(override: Partial<TCreatePartyInput> = {}): TCreatePartyInput {
  return {
    name: 'Os Teimosos',
    characterName: 'Lia',
    config: { ...GAME_CONFIG_DEFAULTS },
    rngState: SeededRng.fromSeed(42).state(),
    now: NOW,
    ...override,
  }
}

describe('Party', () => {
  it('REQ-16: cria grupo de 1 com o host, idle e datas iguais', () => {
    const result = Party.create(input(), sequentialIds('p'))

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const party = result.value
    expect(party.id.toString()).toBe('p-1')
    expect(party.name).toBe('Os Teimosos')
    expect(party.status).toBe('idle')
    expect(party.members).toHaveLength(1)
    expect(party.members[0].id.toString()).toBe('p-2')
    expect(party.members[0].characterName).toBe('Lia')
    expect(party.members[0].kind).toBe('human')
    expect(party.isHost(party.members[0])).toBe(true)
    expect(party.createdAt.toISOString()).toBe(NOW.toISOString())
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  })

  it('REQ-16: registra PartyCreated', () => {
    const result = Party.create(input(), sequentialIds('p'))
    if (!result.isRight()) throw new Error('esperava sucesso')

    const events = result.value.pullDomainEvents()
    expect(events.map((e) => e.type)).toEqual(['PartyCreated'])
    expect(events[0].aggregateId.equals(result.value.id)).toBe(true)
    expect(events[0].occurredAt.toISOString()).toBe(NOW.toISOString())
  })

  it('REQ-17: nomes são gravados sem espaços nas pontas', () => {
    const result = Party.create(
      input({ name: '  Os Teimosos ', characterName: '\tLia  ' }),
      sequentialIds()
    )
    if (!result.isRight()) throw new Error('esperava sucesso')

    expect(result.value.name).toBe('Os Teimosos')
    expect(result.value.members[0].characterName).toBe('Lia')
  })

  it('REQ-17: limites aceitos (40 e 24 caracteres)', () => {
    const result = Party.create(
      input({ name: 'a'.repeat(40), characterName: 'b'.repeat(24) }),
      sequentialIds()
    )

    expect(result.isRight()).toBe(true)
  })

  it.each([
    ['required', undefined],
    ['notString', 42],
    ['notString', null],
    ['blank', '   '],
    ['blank', ''],
    ['tooLong', 'a'.repeat(41)],
  ])('REQ-17: name inválido → %s', (reason, name) => {
    const result = Party.create(input({ name }), sequentialIds())

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'name', reason }])
  })

  it.each([
    ['required', undefined],
    ['notString', ['Lia']],
    ['blank', ' '],
    ['tooLong', 'b'.repeat(25)],
  ])('REQ-17: characterName inválido → %s', (reason, characterName) => {
    const result = Party.create(input({ characterName }), sequentialIds())

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'characterName', reason }])
  })

  it('REQ-17: minPlayers > 1 → belowMinPlayers, depois dos campos', () => {
    const result = Party.create(
      input({
        name: '   ',
        characterName: 'Um nome com mais de vinte e quatro letras',
        config: { ...GAME_CONFIG_DEFAULTS, minPlayers: 2 },
      }),
      sequentialIds()
    )

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([
        { field: 'name', reason: 'blank' },
        { field: 'characterName', reason: 'tooLong' },
        { field: 'members', reason: 'belowMinPlayers' },
      ])
  })

  it('REQ-17: criação inválida não consome ids', () => {
    const ids = sequentialIds('p')
    Party.create(input({ name: '' }), ids)

    expect(ids.next().toString()).toBe('p-1')
  })

  it('REQ-23: guarda uma cópia da configuração', () => {
    const config = { ...GAME_CONFIG_DEFAULTS, actionPointsPerTurn: 3 }
    const result = Party.create(input({ config }), sequentialIds())
    if (!result.isRight()) throw new Error('esperava sucesso')

    config.actionPointsPerTurn = 4

    expect(result.value.config.actionPointsPerTurn).toBe(3)
  })

  it('REQ-20: startSession em idle → inSession, savedAt e SessionStarted', () => {
    const party = makeParty({ status: 'idle', savedAt: NOW })

    expect(party.startSession(LATER)).toBe(true)

    expect(party.status).toBe('inSession')
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionStarted',
    ])
  })

  it('REQ-20 (D-29): startSession em inSession não muda nada', () => {
    const party = makeParty({ status: 'inSession', savedAt: NOW })

    expect(party.startSession(LATER)).toBe(false)

    expect(party.status).toBe('inSession')
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-21: endSession em inSession → idle, savedAt e SessionEnded', () => {
    const party = makeParty({ status: 'inSession', savedAt: NOW })

    const result = party.endSession(LATER)

    expect(result.isRight()).toBe(true)
    expect(party.status).toBe('idle')
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'SessionEnded',
    ])
  })

  it('REQ-21: endSession em idle é rejeitado e nada muda', () => {
    const party = makeParty({ status: 'idle', savedAt: NOW })

    const result = party.endSession(LATER)

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) expect(result.value).toBe('sessionNotActive')
    expect(party.status).toBe('idle')
    expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-24: abandon registra PartyAbandoned', () => {
    const party = makeParty()

    party.abandon(fixedClock().now())

    expect(party.pullDomainEvents().map((e) => e.type)).toEqual([
      'PartyAbandoned',
    ])
  })
})
