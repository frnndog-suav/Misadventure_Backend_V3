import { describe, expect, it } from 'vitest'

import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'

import { PartyMember } from '../party-member'
import type { Party } from '.'

// T-78: movimentar com montaria (REQ-161, D-145; README 26, 12.2; Apêndice B E21).

const AT = fixedClock('2026-11-25T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')
const zone = (zoneId: string, x: number) => ({
  zoneId,
  x,
  y: 0,
  arrows: [] as const,
})
// a—b—d e a—c—d; e—a; f isolada.
const dimension = {
  dimensionCardId: 'fixture.test-dimension',
  startingCityZoneId: 'a',
  map: {
    zones: ['a', 'b', 'c', 'd', 'e', 'f'].map(zone),
    crossings: [
      { zoneIds: ['a', 'b'] as const },
      { zoneIds: ['b', 'd'] as const },
      { zoneIds: ['a', 'c'] as const },
      { zoneIds: ['c', 'd'] as const },
      { zoneIds: ['a', 'e'] as const },
    ],
  },
}

function partyOf(withMount: boolean, actionPoints = 3): Party {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({
        zoneId: 'a',
        mount: withMount
          ? { cardId: 'fixture.plow-horse', inventory: [], tcgFolder: [] }
          : null,
      }),
    },
    MEMBER
  )
  return makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    dimension,
    turn: { round: 1, memberId: MEMBER, actionPoints },
    savedAt: AT,
  })
}

const moved = (party: Party) => {
  const event = party.pullDomainEvents()[0]
  if (event?.type !== 'PlayerMoved') throw new Error('evento errado')
  return event
}

describe('move com montaria (REQ-161)', () => {
  it('REQ-161: com viaZoneId válido, vai ao destino a 2 travessias por 1 PA e o evento traz o meio', () => {
    const party = partyOf(true)

    const result = party.move('d', AT, 'c')

    expect(result.isRight()).toBe(true)
    expect(party.members[0].player.zoneId).toBe('d')
    expect(party.turn.actionPoints).toBe(2)
    const event = moved(party)
    expect(event).toMatchObject({
      fromZoneId: 'a',
      toZoneId: 'd',
      viaZoneId: 'c',
    })
  })

  it('REQ-161 (D-145): sem viaZoneId e só a 2 travessias, o meio é a primeira zona em ordem de id', () => {
    const party = partyOf(true)

    expect(party.move('d', AT).isRight()).toBe(true)

    expect(moved(party).viaZoneId).toBe('b')
  })

  it('REQ-161: sem viaZoneId e a 1 travessia, é movimento simples (viaZoneId null)', () => {
    const party = partyOf(true)

    expect(party.move('b', AT).isRight()).toBe(true)

    expect(party.members[0].player.zoneId).toBe('b')
    expect(moved(party).viaZoneId).toBeNull()
  })

  it('REQ-161: viaZoneId com destino a 1 travessia, se houver o meio, é aceito', () => {
    const party = partyOf(true)
    party.move('b', AT)
    party.pullDomainEvents()

    // de b: c está a 2 travessias (b—a—c e b—d—c).
    expect(party.move('c', AT, 'd').isRight()).toBe(true)
    expect(moved(party).viaZoneId).toBe('d')
  })

  it('REQ-161: sem montaria, move simples segue com viaZoneId null no evento', () => {
    const party = partyOf(false)

    expect(party.move('b', AT).isRight()).toBe(true)

    expect(moved(party).viaZoneId).toBeNull()
  })

  it('REQ-161: sem montaria, viaZoneId → noMount, nada muda', () => {
    const party = partyOf(false)

    const result = party.move('b', AT, 'c')

    expect(result.isLeft() && result.value).toBe('noMount')
    expect(party.members[0].player.zoneId).toBe('a')
    expect(party.turn.actionPoints).toBe(3)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-161: sem montaria, destino a 2 travessias → notConnected', () => {
    const party = partyOf(false)

    const result = party.move('d', AT)
    expect(result.isLeft() && result.value).toBe('notConnected')
    expect(party.members[0].player.zoneId).toBe('a')
  })

  it.each([
    ['viaZoneId sem travessia com a atual', 'd', 'e'],
    ['viaZoneId igual ao destino', 'd', 'd'],
    ['viaZoneId igual à zona atual', 'd', 'a'],
    ['destino a 3 ou mais travessias/isolado', 'f', undefined],
    ['a própria zona', 'a', undefined],
  ])('REQ-161: %s → notConnected, nada muda', (_name, zoneId, via) => {
    const party = partyOf(true)

    const result = party.move(zoneId, AT, via)

    expect(result.isLeft() && result.value).toBe('notConnected')
    expect(party.members[0].player.zoneId).toBe('a')
    expect(party.turn.actionPoints).toBe(3)
    expect(party.pullDomainEvents()).toEqual([])
  })

  it('REQ-161: viaZoneId fora do mapa → viaZoneNotInMap (antes de noMount)', () => {
    const withMount = partyOf(true)
    const without = partyOf(false)

    const a = withMount.move('d', AT, 'x')
    const b = without.move('b', AT, 'x')
    expect(a.isLeft() && a.value).toBe('viaZoneNotInMap')
    expect(b.isLeft() && b.value).toBe('viaZoneNotInMap')
  })

  it('REQ-161: sem pontos → noActionPoints; o RNG não é consumido', () => {
    const party = partyOf(true, 0)
    const before = party.rngState

    const result = party.move('d', AT, 'b')

    expect(result.isLeft() && result.value).toBe('noActionPoints')
    expect(party.rngState).toEqual(before)
  })

  it('REQ-161: o RNG não é consumido ao mover com montaria', () => {
    const party = partyOf(true)
    const before = party.rngState

    party.move('d', AT)

    expect(party.rngState).toEqual(before)
  })
})
