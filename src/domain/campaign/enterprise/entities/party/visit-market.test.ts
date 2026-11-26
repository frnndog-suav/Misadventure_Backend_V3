import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import type { TMarketOperation } from '../../party-action'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

const NOW = fixedClock('2026-11-23T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-23T13:00:00.000Z').now()
const ZONE = 'fixture.gray-harbor'
const POINTS = GAME_CONFIG_DEFAULTS.actionPointsPerTurn

const P = makeItemCard({ id: 'fixture.healing-potion', stockPrice: 6 })
const BO = makeItemCard({
  id: 'fixture.booster',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const C = makeItemCard({
  id: 'fixture.lucky-coin',
  itemCategory: 'treasure',
  rarity: 'uncommon',
})
const W = makeEquipmentCard({
  id: 'fixture.short-sword',
  rarity: 'common',
  priceMultiplier: 1.2,
})
const CARDS: TCard[] = [P, BO, C, W, makeAttributeCard()]

const HARBOR = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'useVault', 'visitMarket', 'saveRespawnPoint'],
  market: { stock: [P.id], singles: true, mounts: [] },
})

const catalog = (zone = HARBOR) => ({
  zone,
  cards: CARDS,
  collectionId: 'fixture',
})

function partyOf(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession',
  withMarkets = true
): Party {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState({ gold: 100, ...player }),
    },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
    ...(withMarkets
      ? {
          markets: [
            {
              zoneId: ZONE,
              factorPercent: 100,
              singles: true,
              stock: [{ cardId: W.id, copies: 3 }],
              showcase: [W.id, null],
            },
          ],
          marketPool: [{ cardId: W.id, departed: 0 }],
        }
      : {}),
  })
  party.provideMarketCandidates([{ cardId: W.id, rarity: 'common' }])
  return party
}

const playerOf = (party: Party) => party.members[0].player
const run = (party: Party, operations: TMarketOperation[], zone = HARBOR) =>
  party.visitMarket(operations, catalog(zone), LATER)

/** Recusado: nada muda (pontos, save, RNG, jogador, mercados) e nenhum evento. */
function expectUntouched(party: Party, before: Party) {
  expect(party.turn.actionPoints).toBe(before.turn.actionPoints)
  expect(party.savedAt.toISOString()).toBe(NOW.toISOString())
  expect(party.rngState).toEqual(before.rngState)
  expect(playerOf(party)).toEqual(playerOf(before))
  expect(party.markets).toEqual(before.markets)
  expect(party.marketPool).toEqual(before.marketPool)
  expect(party.pullDomainEvents()).toEqual([])
}

describe('Party.visitMarket — portas (REQ-140)', () => {
  it('REQ-140: grupo idle → sessionNotActive, nada muda', () => {
    const party = partyOf({}, 'idle')
    const before = partyOf({}, 'idle')

    const result = run(party, [{ operation: 'buySingle', slotIndex: 0 }])

    expect(result.isLeft() && result.value).toBe('sessionNotActive')
    expectUntouched(party, before)
  })

  it('REQ-140: 0 pontos → noActionPoints, antes de zoneActionUnavailable', () => {
    const party = partyOf()
    for (let move = 0; move < POINTS; move++) {
      party.move(
        move % 2 === 0 ? 'fixture.old-mine' : 'fixture.gray-harbor',
        NOW
      )
    }
    party.pullDomainEvents()

    const result = run(
      party,
      [{ operation: 'buySingle', slotIndex: 0 }],
      makeZoneCard()
    )

    expect(party.turn.actionPoints).toBe(0)
    expect(result.isLeft() && result.value).toBe('noActionPoints')
  })

  it('REQ-140: zona sem visitMarket ou sem market → zoneActionUnavailable, nada muda', () => {
    for (const zone of [
      makeUrbanZoneCard(),
      makeUrbanZoneCard({ zoneActions: ['visitMarket'], market: null }),
    ]) {
      const party = partyOf()
      const before = partyOf()

      const result = run(
        party,
        [{ operation: 'buySingle', slotIndex: 0 }],
        zone
      )

      expect(result.isLeft() && result.value).toBe('zoneActionUnavailable')
      expectUntouched(party, before)
    }
  })
})

describe('Party.visitMarket — lote (REQ-140 a REQ-142; D-118)', () => {
  it('REQ-140: aceito gasta 1 PA, aplica, grava lastMarketVisit e registra o evento', () => {
    const party = partyOf()

    const result = run(party, [
      { operation: 'buyStock', cardId: P.id, quantity: 2 },
      { operation: 'buySingle', slotIndex: 0 },
    ])

    expect(result.isRight()).toBe(true)
    expect(party.turn.actionPoints).toBe(POINTS - 1)
    expect(party.savedAt.toISOString()).toBe(LATER.toISOString())
    const player = playerOf(party)
    expect(player.gold).toBe(100 - 12 - 6)
    expect(player.inventory).toEqual([
      { cardId: P.id, quantity: 2 },
      { cardId: W.id, quantity: 1 },
    ])
    expect(player.lastMarketVisit).toEqual({
      zoneId: ZONE,
      goldLost: 0,
      results: [
        {
          operation: 'buyStock',
          cardId: P.id,
          quantity: 2,
          copiesReceived: 2,
          received: [{ space: 'inventory', quantity: 2 }],
          gold: -12,
        },
        {
          operation: 'buySingle',
          slotIndex: 0,
          cardId: W.id,
          destination: 'inventory',
          gold: -6,
        },
      ],
    })
    expect(party.pullDomainEvents()).toEqual([
      {
        type: 'MarketVisited',
        memberId: new UniqueEntityID('member-1'),
        zoneId: ZONE,
        results: player.lastMarketVisit?.results,
        goldLost: 0,
        occurredAt: LATER,
        aggregateId: party.id,
      },
    ])
  })

  it('REQ-140: a compra de single usa o RNG do grupo e muda a vitrine; a de estoque não', () => {
    const before = partyOf()
    const stockOnly = partyOf()
    run(stockOnly, [{ operation: 'buyStock', cardId: P.id, quantity: 1 }])
    expect(stockOnly.rngState).toEqual(before.rngState)

    const single = partyOf()
    run(single, [{ operation: 'buySingle', slotIndex: 0 }])
    expect(single.rngState).not.toEqual(before.rngState)
    expect(single.marketPool).toEqual([{ cardId: W.id, departed: 1 }])
    expect(single.markets[0].stock).toEqual([{ cardId: W.id, copies: 2 }])
  })

  it('REQ-140: lote recusado — nem PA, ouro, cartas, vitrine nem RNG mudam; a recusa traz o índice', () => {
    const party = partyOf({ gold: 7 })
    const before = partyOf({ gold: 7 })

    const result = run(party, [
      { operation: 'buySingle', slotIndex: 0 },
      { operation: 'buyStock', cardId: P.id, quantity: 1 },
    ])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 1,
      cardId: P.id,
    })
    expectUntouched(party, before)
  })

  it('REQ-175: booster fora da vigência reverte a compra e reposição do single', () => {
    const party = partyOf()
    const before = partyOf()
    const cardId = 'other.out-of-market-booster'

    const result = run(party, [
      { operation: 'buySingle', slotIndex: 0 },
      { operation: 'buyBooster', cardId, quantity: 1 },
    ])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notMarketBooster',
      operationIndex: 1,
      cardId,
    })
    expectUntouched(party, before)
  })

  it('REQ-140: a visita pode ser repetida na mesma vez; lastMarketVisit é o da última', () => {
    const party = partyOf()

    run(party, [{ operation: 'buyStock', cardId: P.id, quantity: 1 }])
    run(party, [{ operation: 'buyStock', cardId: P.id, quantity: 2 }])

    expect(party.turn.actionPoints).toBe(POINTS - 2)
    expect(playerOf(party).inventory).toEqual([{ cardId: P.id, quantity: 3 }])
    expect(playerOf(party).lastMarketVisit?.results).toHaveLength(1)
    expect(playerOf(party).lastMarketVisit?.results[0]).toMatchObject({
      quantity: 2,
    })
  })

  it('REQ-142: o ouro perdido acima da bolsa sai no evento e em lastMarketVisit.goldLost', () => {
    const party = partyOf({
      gold: 290,
      inventory: [{ cardId: C.id, quantity: 1 }],
    })

    run(party, [
      { operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 },
    ])

    expect(playerOf(party).gold).toBe(300)
    expect(playerOf(party).lastMarketVisit?.goldLost).toBe(15)
    const [event] = party.pullDomainEvents()
    expect(event).toMatchObject({ type: 'MarketVisited', goldLost: 15 })
  })

  it('CONTRATO v0.79: save antigo (sem mercado sorteado) compra no fator 100 e não tem vitrine', () => {
    const legacy = partyOf({}, 'inSession', false)

    const single = run(legacy, [{ operation: 'buySingle', slotIndex: 0 }])
    expect(single.isLeft() && single.value).toMatchObject({
      reason: 'singlesUnavailable',
    })

    const stock = run(legacy, [
      { operation: 'buyStock', cardId: P.id, quantity: 1 },
    ])
    expect(stock.isRight()).toBe(true)
    expect(playerOf(legacy).gold).toBe(94)
  })
})

describe('Party.describeMarket (REQ-140)', () => {
  const cards = new Map<string, TCard>([
    [HARBOR.id, HARBOR],
    [
      'fixture.test-dimension',
      { type: 'dimension', collectionId: 'fixture' } as unknown as TCard,
    ],
    ...CARDS.map((card): [string, TCard] => [card.id, card]),
  ])

  it('REQ-140: o membro da vez numa zona com mercado recebe a projeção com preços', () => {
    const party = partyOf()

    const view = party.describeMarket(party.members[0], cards)

    expect(view?.zoneId).toBe(ZONE)
    expect(view?.stock).toEqual([
      { cardId: P.id, price: 6, copiesPerPurchase: 1 },
    ])
    expect(view?.boosters).toEqual([{ cardId: BO.id, price: 30 }])
    expect(view?.showcase?.[0].offer).toEqual({
      cardId: W.id,
      price: 6,
      destination: 'inventory',
    })
  })

  it('REQ-140: quem não é da vez, ou numa zona sem mercado, recebe null', () => {
    const party = partyOf()
    const other = PartyMember.create(
      { characterName: 'Bo', kind: 'human', player: makePlayerState() },
      new UniqueEntityID('member-2')
    )

    expect(party.describeMarket(other, cards)).toBeNull()
    expect(
      party.describeMarket(
        party.members[0],
        new Map([[makeUrbanZoneCard().id, makeUrbanZoneCard()]])
      )
    ).toBeNull()
  })
})
