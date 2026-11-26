import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeDimensionCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'

import { PartyPresenter } from '.'

describe('PartyPresenter — elegibilidade para conclusão (T-83)', () => {
  const zone = makeUrbanZoneCard()
  const shard = makeItemCard({ id: 'fixture.shard', completionItem: true })
  const dimension = makeDimensionCard({
    id: 'fixture.test-dimension',
    completion: {
      zoneTitle: zone.title,
      requirement: [{ cardId: shard.id, count: 2 }],
      grandPrize: { cards: [], gold: 0 },
      finalBoss: null,
    },
  })
  const cards = new Map<string, TCard>(
    [zone, shard, dimension].map((card) => [card.id, card])
  )

  it.each([
    { quantity: 2, actionPoints: 1, eligible: true },
    { quantity: 1, actionPoints: 1, eligible: false },
    { quantity: 2, actionPoints: 0, eligible: false },
  ])(
    'REQ-167: elegibilidade $eligible com $quantity itens e $actionPoints PA',
    ({ quantity, actionPoints, eligible }) => {
      const memberId = new UniqueEntityID('member-1')
      const member = PartyMember.create(
        {
          characterName: 'Lia',
          kind: 'human',
          player: makePlayerState({
            zoneId: zone.id,
            completionItems: [{ cardId: shard.id, quantity }],
          }),
        },
        memberId
      )
      const party = makeParty({
        status: 'inSession',
        members: [member],
        hostMemberId: memberId,
        turn: { round: 1, memberId, actionPoints },
      })
      const { availableActions } = PartyPresenter.toHTTP(party, cards)
        .members[0].player
      if (eligible)
        expect(availableActions.slice(-2)).toEqual([
          'completeDimension',
          'endTurn',
        ])
      else expect(availableActions).not.toContain('completeDimension')
    }
  )
})
