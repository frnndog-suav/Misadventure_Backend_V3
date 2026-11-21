import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import type { TPlayerStatus } from '../../player-status'
import { PartyMember, type TPlayerState } from '../party-member'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

const AT = fixedClock().now()

function member(id: string, player: Partial<TPlayerState> = {}) {
  return PartyMember.create(
    { characterName: id, kind: 'human', player: makePlayerState(player) },
    new UniqueEntityID(id)
  )
}

const protection: TPlayerStatus = {
  statusId: 'protect-peak',
  sourceCardId: 'fixture.protect-peak',
  effectIndex: 0,
  text: 'Protege o Pico até o nocaute.',
  mark: 'buff',
  activation: [{ kind: 'keepPeakOnKnockout' }],
  duration: { kind: 'untilKnockout' },
  remaining: null,
}

describe('Penalidades e passagem de vez (REQ-128)', () => {
  it('REQ-128: protege o Pico antes de expirar o status no nocaute', () => {
    const fallen = member('member-1', {
      down: true,
      health: 0,
      peak: 19,
      statuses: [protection],
    })
    const party = makeParty({ status: 'inSession', members: [fallen] })

    party.completeKnockout()

    const player = party.members[0].player
    expect(player.peak).toBe(19)
    expect(player.statuses).toEqual([])
    expect(player.down).toBe(false)
    expect(player.skipNextTurn).toBe(false)
    expect(party.turn.round).toBe(3)
  })

  it('REQ-128: com espera zero, abre R+1 com PA renovados e aplica uma recarga', () => {
    const fallen = member('member-1', {
      down: true,
      health: 0,
      abilityUsage: { 'fixture.ability': { uses: 1, cooldown: 2 } },
      gold: 29,
      vault: { slots: [], decks: [], gold: 40 },
    })
    const config = { ...GAME_CONFIG_DEFAULTS, soloKnockoutWaitRounds: 0 }
    const party = makeParty({
      status: 'inSession',
      members: [fallen],
      config,
      turn: { round: 4, memberId: fallen.id, actionPoints: 1 },
    })

    party.completeKnockout()

    expect(party.turn).toEqual({
      round: 5,
      memberId: fallen.id,
      actionPoints: config.actionPointsPerTurn,
    })
    const player = party.members[0].player
    expect(player.abilityUsage).toEqual({
      'fixture.ability': { uses: 0, cooldown: 1 },
    })
    expect(player.gold).toBe(27)
    expect(player.vault.gold).toBe(40)
    expect(player.down).toBe(false)
  })

  it('REQ-128: consome a marca somente ao chegar a próxima vez do membro na ordem', () => {
    const first = member('member-1')
    const fallen = member('member-2', { down: true, health: 0 })
    const last = member('member-3')
    const party = makeParty({
      status: 'inSession',
      members: [first, last, fallen],
      turnOrder: [first.id, fallen.id, last.id],
      turn: { round: 1, memberId: fallen.id, actionPoints: 1 },
    })
    const fallenPlayer = () => party.members[2].player

    party.completeKnockout()

    expect(party.turn.memberId).toEqual(last.id)
    expect(party.turn.round).toBe(1)
    expect(fallenPlayer()).toHaveProperty('skipNextTurn', true)

    expect(party.endTurn(AT).isRight()).toBe(true)
    expect(party.turn.memberId).toEqual(first.id)
    expect(party.turn.round).toBe(2)
    expect(fallenPlayer()).toHaveProperty('skipNextTurn', true)

    expect(party.endTurn(AT).isRight()).toBe(true)
    expect(party.turn.memberId).toEqual(last.id)
    expect(party.turn.round).toBe(2)
    expect(fallenPlayer()).toHaveProperty('skipNextTurn', false)

    expect(party.endTurn(AT).isRight()).toBe(true)
    expect(party.turn.memberId).toEqual(first.id)
    expect(party.endTurn(AT).isRight()).toBe(true)
    expect(party.turn.memberId).toEqual(fallen.id)
    expect(party.turn.round).toBe(3)
    expect(party.turn.actionPoints).toBe(party.config.actionPointsPerTurn)
  })
})
