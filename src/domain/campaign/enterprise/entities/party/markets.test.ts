import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TAttributeCard,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeFixtureContent } from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'

import {
  decayMarkets,
  drawMarkets,
  type TMarketCandidate,
  type TMarketsState,
} from '../../markets'
import { PartyMember } from '../party-member'
import { Party, type TCreatePartyInput } from '.'

const NOW = fixedClock('2026-11-23T12:00:00.000Z').now()
const FIXTURE = makeFixtureContent()
const dimension =
  FIXTURE.cards.find((c): c is TDimensionCard => c.type === 'dimension') ?? null
const zones = FIXTURE.cards.filter((c): c is TZoneCard => c.type === 'zone')
const attributeCards = FIXTURE.cards.filter(
  (c): c is TAttributeCard => c.type === 'attribute'
)

const CANDIDATES: TMarketCandidate[] = [
  { cardId: 'fixture.a-card', rarity: 'common' },
  { cardId: 'fixture.b-card', rarity: 'epic' },
]

const withMarket = zones.map((zone) =>
  zone.id === 'fixture.gray-harbor'
    ? {
        ...zone,
        zoneActions: [...zone.zoneActions, 'visitMarket' as const],
        market: { stock: [], singles: true },
      }
    : zone
)

function input(override: Partial<TCreatePartyInput> = {}): TCreatePartyInput {
  return {
    name: 'Os Teimosos',
    characterName: 'Lia',
    playerClass: 'warrior',
    classDefinition: FIXTURE.classes[0],
    attributeCards,
    dimension,
    zones,
    config: { ...GAME_CONFIG_DEFAULTS },
    rngState: SeededRng.fromSeed(42).state(),
    now: NOW,
    ...override,
  }
}

function create(override: Partial<TCreatePartyInput> = {}): Party {
  const created = Party.create(input(override), sequentialIds('p'))
  if (!created.isRight()) throw new Error('esperava sucesso')
  return created.value
}

describe('Party — mercados na criação (REQ-138)', () => {
  it('REQ-138: sem mercado no mapa, não há mercados nem pool e o RNG não é usado a mais', () => {
    const plain = create()
    const withCandidates = create({ marketCandidates: CANDIDATES })

    expect(plain.markets).toEqual([])
    expect(plain.marketPool).toEqual([])
    expect(withCandidates.rngState).toEqual(plain.rngState)
  })

  it('REQ-138: o sorteio dos mercados é o último uso do RNG da criação', () => {
    const plain = create()
    const marketed = create({ zones: withMarket, marketCandidates: CANDIDATES })

    expect(marketed.dimension).toEqual(plain.dimension)
    expect(marketed.turnOrder).toEqual(plain.turnOrder)
    expect(marketed.rewardDecks).toEqual(plain.rewardDecks)
    expect(marketed.rngState).not.toEqual(plain.rngState)
  })

  it('REQ-138: reproduz o sorteio do módulo com o mesmo RNG, em zonas do mapa', () => {
    const plain = create()
    const marketed = create({ zones: withMarket, marketCandidates: CANDIDATES })

    const rng = SeededRng.fromState(plain.rngState)
    const expected = drawMarkets(
      [{ zoneId: 'fixture.gray-harbor', singles: true }],
      CANDIDATES,
      GAME_CONFIG_DEFAULTS,
      rng
    )
    expect(marketed.markets).toEqual(expected.markets)
    expect(marketed.marketPool).toEqual(expected.pool)
    expect(marketed.rngState).toEqual(rng.state())
    expect(marketed.markets[0].factorPercent).toBeGreaterThanOrEqual(80)
    expect(marketed.markets[0].factorPercent).toBeLessThanOrEqual(120)
  })

  it('REQ-138: pool menor que 20 entra inteiro e a vitrine tem 4 slots', () => {
    const marketed = create({ zones: withMarket, marketCandidates: CANDIDATES })

    expect(marketed.marketPool.map(({ cardId }) => cardId)).toEqual([
      'fixture.a-card',
      'fixture.b-card',
    ])
    expect(marketed.markets[0].showcase).toHaveLength(4)
  })

  it('REQ-143, D-120: o jogador começa com as 5 expansões em 0', () => {
    expect(create().members[0].player.expansions).toEqual({
      vaultSlots: 0,
      deckSlots: 0,
      tcgFolder: 0,
      purse: 0,
      vaultGold: 0,
    })
  })
})

const SAVED: TMarketsState = {
  markets: [
    {
      zoneId: 'fixture.gray-harbor',
      factorPercent: 100,
      singles: true,
      stock: [{ cardId: 'fixture.a-card', copies: 2 }],
      showcase: ['fixture.a-card', null],
    },
  ],
  pool: [{ cardId: 'fixture.a-card', departed: 0 }],
}

function marketParty(
  override: Parameters<typeof makeParty>[0] = {},
  state: TMarketsState = SAVED
): Party {
  const party = makeParty({
    status: 'inSession',
    markets: state.markets,
    marketPool: state.pool,
    ...override,
  })
  party.provideMarketCandidates(CANDIDATES)
  return party
}

describe('Party — decaimento no fim da rodada (REQ-139)', () => {
  it('REQ-139: a vez que não fecha a rodada não mexe nos mercados nem no RNG', () => {
    const first = PartyMember.create(
      { characterName: 'A', kind: 'human', player: makePlayerState() },
      new UniqueEntityID('member-1')
    )
    const second = PartyMember.create(
      { characterName: 'B', kind: 'human', player: makePlayerState() },
      new UniqueEntityID('member-2')
    )
    const party = marketParty({
      members: [first, second],
      turnOrder: [first.id, second.id],
      turn: { round: 1, memberId: first.id, actionPoints: 3 },
    })
    const rngBefore = party.rngState

    party.endTurn(NOW)

    expect(party.turn.round).toBe(1)
    expect(party.markets).toEqual(SAVED.markets)
    expect(party.rngState).toEqual(rngBefore)
  })

  it('REQ-139: ao virar a rodada, rola o D20 de cada slot preenchido com o RNG do grupo', () => {
    const party = marketParty()
    const rng = SeededRng.fromState(party.rngState)
    const expected = decayMarkets(SAVED, CANDIDATES, GAME_CONFIG_DEFAULTS, rng)

    party.endTurn(NOW)

    expect(party.turn.round).toBe(2)
    expect(party.markets).toEqual(expected.markets)
    expect(party.marketPool).toEqual(expected.pool)
    expect(party.rngState).toEqual(rng.state())
  })

  it('REQ-139: com D20 sempre no decaimento, a última carta sai do pool e o pool novo é sorteado', () => {
    const config = { ...GAME_CONFIG_DEFAULTS, singlesDecayMax: 20 }
    const party = marketParty(
      { config },
      {
        markets: [
          {
            zoneId: 'fixture.gray-harbor',
            factorPercent: 100,
            singles: true,
            stock: [{ cardId: 'fixture.a-card', copies: 1 }],
            showcase: ['fixture.a-card', null, null, null],
          },
        ],
        pool: [{ cardId: 'fixture.a-card', departed: 0 }],
      }
    )

    party.endTurn(NOW)

    // o novo pool enche os slots que ainda serão rolados (D-125), então já há saídas.
    expect(party.marketPool.length).toBeGreaterThan(0)
    expect(
      party.marketPool.every(({ cardId }) =>
        CANDIDATES.some((candidate) => candidate.cardId === cardId)
      )
    ).toBe(true)
  })

  it('REQ-139: o nocaute solo também fecha rodadas e cada uma decai uma vez', () => {
    const config = { ...GAME_CONFIG_DEFAULTS, soloKnockoutWaitRounds: 2 }
    const fallen = PartyMember.create(
      {
        characterName: 'Lia',
        kind: 'human',
        player: makePlayerState({ down: true, health: 0 }),
      },
      new UniqueEntityID('member-1')
    )
    const party = marketParty({
      config,
      members: [fallen],
      turn: { round: 4, memberId: fallen.id, actionPoints: 1 },
    })
    const rng = SeededRng.fromState(party.rngState)
    let expected: TMarketsState = SAVED
    for (let round = 0; round < 3; round++)
      expected = decayMarkets(expected, CANDIDATES, config, rng)

    party.completeKnockout()

    expect(party.turn.round).toBe(7)
    expect(party.markets).toEqual(expected.markets)
    expect(party.marketPool).toEqual(expected.pool)
    expect(party.rngState).toEqual(rng.state())
  })

  it('REQ-139: save sem mercados vira a rodada sem usar o RNG', () => {
    const party = makeParty({ status: 'inSession' })
    const rngBefore = party.rngState

    party.endTurn(NOW)

    expect(party.turn.round).toBe(2)
    expect(party.markets).toEqual([])
    expect(party.rngState).toEqual(rngBefore)
  })
})

describe('Party — conteúdo em uso (REQ-136)', () => {
  it('REQ-136: cartas do pool e das vitrines contam como em uso', () => {
    const party = makeParty({
      markets: [
        {
          zoneId: 'fixture.gray-harbor',
          factorPercent: 100,
          singles: true,
          stock: [{ cardId: 'fixture.a-card', copies: 2 }],
          showcase: ['fixture.a-card', null],
        },
      ],
      marketPool: [
        { cardId: 'fixture.a-card', departed: 0 },
        { cardId: 'fixture.c-card', departed: 1 },
      ],
    })

    const { cardIds } = party.contentInUse()

    expect(cardIds).toContain('fixture.a-card')
    expect(cardIds).toContain('fixture.c-card')
  })

  it('REQ-136: carta só no estoque de um mercado também conta', () => {
    const party = makeParty({
      markets: [
        {
          zoneId: 'fixture.gray-harbor',
          factorPercent: 100,
          singles: true,
          stock: [{ cardId: 'fixture.d-card', copies: 1 }],
          showcase: [null],
        },
      ],
      marketPool: [],
    })

    expect(party.contentInUse().cardIds).toContain('fixture.d-card')
  })
})
