import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'
import { PartyMember } from '../entities/party-member'
import { availableActions } from '.'

const HARBOR = 'fixture.gray-harbor'
const MINE = 'fixture.old-mine'

describe('availableActions', () => {
  const inSession = () => makeParty({ status: 'inSession' })
  const memberId = new UniqueEntityID('member-1')

  it('REQ-58/REQ-67: membro da vez com pontos e destinos → move, recover, adjustDeck, endTurn (nesta ordem)', () => {
    expect(availableActions(inSession(), memberId)).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'endTurn',
    ])
  })

  it('REQ-58/REQ-67: com 0 pontos → só endTurn (recover e adjustDeck também custam 1)', () => {
    const party = inSession()
    party.move(MINE, party.savedAt)
    party.move(HARBOR, party.savedAt)
    party.move(MINE, party.savedAt)

    expect(availableActions(party, memberId)).toEqual(['endTurn'])
  })

  it('REQ-58/REQ-67: sem moveTargets (zona sem travessia) → recover, adjustDeck, endTurn', () => {
    const lonely = makePlayerState({ zoneId: 'fixture.island' })
    const host = PartyMember.create(
      { characterName: 'Lia', kind: 'human', player: lonely },
      memberId
    )
    const party = makeParty({
      status: 'inSession',
      members: [host],
      hostMemberId: host.id,
      dimension: {
        dimensionCardId: 'fixture.test-dimension',
        startingCityZoneId: HARBOR,
        map: {
          zones: [
            { zoneId: HARBOR, x: 0, y: 0, arrows: [] },
            { zoneId: 'fixture.island', x: 5, y: 5, arrows: [] },
          ],
          crossings: [],
        },
      },
    })

    expect(availableActions(party, memberId)).toEqual([
      'recover',
      'adjustDeck',
      'endTurn',
    ])
  })

  it('REQ-58 (11.4): quem não é da vez → []', () => {
    const base = inSession()
    const other = PartyMember.create(
      { characterName: 'Bo', kind: 'human', player: makePlayerState() },
      new UniqueEntityID('member-2')
    )
    const party = makeParty({
      status: 'inSession',
      members: [...base.members, other],
      turnOrder: [base.members[0].id, other.id],
    })

    expect(availableActions(party, other.id)).toEqual([])
    expect(availableActions(party, base.members[0].id)).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'endTurn',
    ])
  })
})
