import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'
import { PartyMember, type TPlayerState } from '../entities/party-member'
import { availableActions } from '.'

const HARBOR = 'fixture.gray-harbor'
const MINE = 'fixture.old-mine'

describe('availableActions', () => {
  const inSession = () => makeParty({ status: 'inSession' })
  const memberId = new UniqueEntityID('member-1')

  it('REQ-58/REQ-67: membro da vez com pontos e destinos → move, recover, adjustDeck, endTurn (nesta ordem)', () => {
    expect(availableActions(inSession(), memberId, new Set())).toEqual([
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

    expect(availableActions(party, memberId, new Set())).toEqual(['endTurn'])
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

    expect(availableActions(party, memberId, new Set())).toEqual([
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

    expect(availableActions(party, other.id, new Set())).toEqual([])
    expect(availableActions(party, base.members[0].id, new Set())).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'endTurn',
    ])
  })

  describe('prepare (REQ-75, D-77)', () => {
    const SWORD = 'fixture.blade-of-dusk'
    const partyWith = (player: Partial<TPlayerState>) => {
      const host = PartyMember.create(
        {
          characterName: 'Lia',
          kind: 'human',
          player: makePlayerState(player),
        },
        memberId
      )
      return makeParty({
        status: 'inSession',
        members: [host],
        hostMemberId: host.id,
      })
    }
    const withSword = (cardId: string) =>
      partyWith({ inventory: [{ cardId, quantity: 1 }] })

    it('REQ-75: com equipamento no inventário → prepare entre recover e adjustDeck', () => {
      expect(
        availableActions(withSword(SWORD), memberId, new Set([SWORD]))
      ).toEqual(['move', 'recover', 'prepare', 'adjustDeck', 'endTurn'])
    })

    it('REQ-75: só itens que não são equipamento no inventário → sem prepare', () => {
      expect(
        availableActions(
          withSword('fixture.healing-potion'),
          memberId,
          new Set([SWORD])
        )
      ).not.toContain('prepare')
    })

    it('REQ-75: com equipamento em uso e inventário vazio → prepare', () => {
      const party = partyWith({
        equipment: { ...makePlayerState().equipment, weapon: SWORD },
      })

      expect(availableActions(party, memberId, new Set())).toContain('prepare')
    })

    it('REQ-75: com 0 pontos, prepare continua (gratuita)', () => {
      const party = withSword(SWORD)
      party.move(MINE, party.savedAt)
      party.move(HARBOR, party.savedAt)
      party.move(MINE, party.savedAt)

      expect(availableActions(party, memberId, new Set([SWORD]))).toEqual([
        'prepare',
        'endTurn',
      ])
    })
  })
})

describe('availableActions — useVault (REQ-93)', () => {
  const memberId = new UniqueEntityID('member-1')
  const inSession = () => makeParty({ status: 'inSession' })

  it('REQ-93: zona com useVault e pontos → useVault entra antes de endTurn, depois de adjustDeck', () => {
    expect(
      availableActions(inSession(), memberId, new Set(), ['useVault'])
    ).toEqual(['move', 'recover', 'adjustDeck', 'useVault', 'endTurn'])
  })

  it('REQ-93: zona sem useVault → não entra', () => {
    expect(
      availableActions(inSession(), memberId, new Set(), ['startEvent'])
    ).not.toContain('useVault')
  })

  it('REQ-93: com 0 pontos → useVault não entra (custa 1 ponto)', () => {
    const party = inSession()
    party.move(MINE, party.savedAt)
    party.move(HARBOR, party.savedAt)
    party.move(MINE, party.savedAt)

    expect(availableActions(party, memberId, new Set(), ['useVault'])).toEqual([
      'endTurn',
    ])
  })

  it('REQ-93: quem não é da vez não tem nada', () => {
    expect(
      availableActions(inSession(), new UniqueEntityID('outro'), new Set(), [
        'useVault',
      ])
    ).toEqual([])
  })
})
