import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { effectiveModifiers } from '../../effective-modifiers'
import { PartyMember } from '../party-member'
import type { TPlayerStatus } from '../../player-status'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

const AT = fixedClock().now()

function status(
  statusId: string,
  duration: TPlayerStatus['duration'],
  remaining: number | null = null
): TPlayerStatus {
  return {
    statusId,
    sourceCardId: 'fixture.strength-tonic',
    effectIndex: 0,
    text: '+3 de Ataque.',
    mark: 'buff',
    activation: [
      { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 3 }] },
    ],
    duration,
    remaining,
  }
}

function partyWithStatuses(...lists: TPlayerStatus[][]) {
  const members = lists.map((statuses, i) =>
    PartyMember.create(
      {
        characterName: `Player ${i}`,
        kind: 'human',
        player: makePlayerState({ statuses }),
      },
      new UniqueEntityID(`member-${i}`)
    )
  )
  return makeParty({
    members,
    hostMemberId: members[0].id,
    turnOrder: members.map((member) => member.id),
    status: 'inSession',
  })
}

describe('Status na partida (REQ-103)', () => {
  it('REQ-103: o bônus vale por duas vezes do dono e só vence no segundo endTurn dele', () => {
    const buff = status('buff', { kind: 'forOwnTurns', turns: 2 }, 2)
    const party = partyWithStatuses([buff], [])
    const attack = () =>
      effectiveModifiers({ ...party.members[0].player, equipment: [] }).attack

    expect(attack()).toBe(9)
    party.endTurn(AT)
    expect(party.members[0].player.statuses).toEqual([
      { ...buff, remaining: 1 },
    ])
    party.endTurn(AT)
    expect(attack()).toBe(9)
    expect(
      party.pullDomainEvents().some((event) => event.type === 'StatusExpired')
    ).toBe(false)
    party.endTurn(AT)
    expect(party.members[0].player.statuses).toEqual([])
    expect(attack()).toBe(6)
    expect(party.pullDomainEvents()).toMatchObject([
      { type: 'TurnEnded' },
      { type: 'TurnStarted' },
      {
        type: 'StatusExpired',
        memberId: party.members[0].id,
        statusId: 'buff',
        occurredAt: AT,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-103: fim da vez, início da próxima e fim da rodada atingem os donos corretos', () => {
    const party = partyWithStatuses(
      [
        status('a-next', { kind: 'untilStartOfNextTurn' }),
        status('a-turn', { kind: 'untilEndOfTurn' }),
        status('a-round', { kind: 'untilEndOfRound' }),
      ],
      [
        status('b-next', { kind: 'untilStartOfNextTurn' }),
        status('b-rounds', { kind: 'forRounds', rounds: 2 }, 2),
      ]
    )
    const ids = () =>
      party.members.map((member) =>
        member.player.statuses.map((entry) => entry.statusId)
      )
    const expired = () =>
      party
        .pullDomainEvents()
        .flatMap((event) =>
          event.type === 'StatusExpired' ? [event.statusId] : []
        )

    party.endTurn(AT)
    expect(ids()).toEqual([['a-next', 'a-round'], ['b-rounds']])
    expect(expired()).toEqual(['a-turn', 'b-next'])
    party.endTurn(AT)
    expect(ids()).toEqual([[], ['b-rounds']])
    expect(party.members[1].player.statuses[0].remaining).toBe(1)
    expect(expired()).toEqual(['a-next', 'a-round'])
    party.endTurn(AT)
    party.endTurn(AT)
    expect(ids()).toEqual([[], []])
    expect(expired()).toEqual(['b-rounds'])
  })

  it('REQ-103: movimento recusado preserva status e movimento aceito expira só os do viajante, em ordem', () => {
    const zone = (id: string) => status(id, { kind: 'untilLeaveZone' })
    const infinite = status('infinite', { kind: 'infinite' })
    const untilEnd = status('party-end', { kind: 'untilPartyEnd' })
    const party = partyWithStatuses(
      [zone('first'), infinite, zone('second'), untilEnd],
      [zone('other')]
    )

    expect(party.move('fixture.nowhere', AT)).toMatchObject({
      value: 'zoneNotInMap',
    })
    expect(party.pullDomainEvents()).toEqual([])
    expect(party.members[0].player.statuses).toHaveLength(4)
    expect(party.move('fixture.old-mine', AT).isRight()).toBe(true)
    expect(party.members[0].player.statuses).toEqual([infinite, untilEnd])
    expect(party.members[1].player.statuses).toEqual([zone('other')])
    expect(party.pullDomainEvents()).toMatchObject([
      { type: 'PlayerMoved' },
      { type: 'StatusExpired', statusId: 'first' },
      { type: 'StatusExpired', statusId: 'second' },
    ])
    party.endTurn(AT)
    party.endTurn(AT)
    expect(party.members[0].player.statuses).toEqual([infinite, untilEnd])
  })
})
