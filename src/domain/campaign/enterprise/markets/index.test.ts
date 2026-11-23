import { describe, expect, it } from 'vitest'

import type { SeededRng } from '@/core/rng/seeded-rng'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'

import {
  decayMarkets,
  departSingle,
  drawMarkets,
  marketCandidatesOf,
  marketZonesOf,
  type TMarketsState,
} from '.'

type TStep = readonly [min: number, max: number, value: number]

/** RNG com chamadas `nextInt(min, max)` roteirizadas: confere a faixa de cada uma e o fim do roteiro. */
function scriptedRng(steps: readonly TStep[]) {
  const queue = [...steps]
  const rng = {
    nextInt: (min: number, max: number) => {
      const next = queue.shift()
      if (!next) throw new Error(`chamada extra: nextInt(${min}, ${max})`)
      expect([min, max]).toEqual([next[0], next[1]])
      return next[2]
    },
  } as unknown as SeededRng
  return { rng, remaining: () => queue.length }
}

const config = {
  ...GAME_CONFIG_DEFAULTS,
  singlesShowcaseSlots: 2,
  singlesStockCommon: 6,
  singlesStockEpic: 1,
}

describe('marketCandidatesOf', () => {
  it('REQ-138: atributo, equipamento e item, exceto tesouro e booster, por id', () => {
    const cards = [
      makeItemCard({ id: 'z.booster', itemCategory: 'booster' }),
      makeItemCard({ id: 'm.potion', itemCategory: 'consumable' }),
      makeAttributeCard({ id: 'c.focus', rarity: 'rare' }),
      makeItemCard({ id: 'a.gem', itemCategory: 'treasure' }),
      makeEquipmentCard({ id: 'b.sword', rarity: 'epic' }),
      makeZoneCard({ id: 'd.zone' }),
    ]

    expect(marketCandidatesOf(cards)).toEqual([
      { cardId: 'b.sword', rarity: 'epic' },
      { cardId: 'c.focus', rarity: 'rare' },
      { cardId: 'm.potion', rarity: makeItemCard().rarity },
    ])
  })
})

describe('marketZonesOf', () => {
  it('REQ-138: zonas do mapa com mercado, na ordem do mapa', () => {
    const zones = [
      makeZoneCard({ id: 'a', market: { stock: [], singles: false } }),
      makeZoneCard({ id: 'b', market: null }),
      makeZoneCard({ id: 'c', market: { stock: [], singles: true } }),
    ]

    expect(marketZonesOf(['c', 'b', 'a'], zones)).toEqual([
      { zoneId: 'c', singles: true },
      { zoneId: 'a', singles: false },
    ])
  })
})

describe('drawMarkets', () => {
  it('REQ-138: sem mercado no mapa, não há fator, pool nem uso do RNG', () => {
    const { rng } = scriptedRng([])

    expect(
      drawMarkets([], [{ cardId: 'x', rarity: 'common' }], config, rng)
    ).toEqual({ markets: [], pool: [] })
  })

  it('REQ-138: só mercados sem singles sorteiam o fator e não sorteiam pool', () => {
    const { rng, remaining } = scriptedRng([[80, 120, 95]])

    const state = drawMarkets(
      [{ zoneId: 'a', singles: false }],
      [{ cardId: 'x', rarity: 'common' }],
      config,
      rng
    )

    expect(state).toEqual({
      markets: [
        {
          zoneId: 'a',
          factorPercent: 95,
          singles: false,
          stock: [],
          showcase: [],
        },
      ],
      pool: [],
    })
    expect(remaining()).toBe(0)
  })

  it('REQ-138: fator, pool, cópias cópia a cópia e vitrines, nesta ordem, com slot vazio', () => {
    const { rng, remaining } = scriptedRng([
      // 1) fatores: A, B (sem singles), C
      [80, 120, 110],
      [80, 120, 90],
      [80, 120, 120],
      // 2) pool: 2 elegíveis <= 20, entram todas sem RNG
      // 3) x (Comum, 6 cópias) para A ou C; y (Épica, 1 cópia)
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
      // 4) vitrines: A.0 só x (1 opção); A.1 sem opção (x já está; y sem estoque em A)
      [0, 0, 0],
      // C.0 x ou y; C.1 só x
      [0, 1, 1],
      [0, 0, 0],
    ])

    const state = drawMarkets(
      [
        { zoneId: 'A', singles: true },
        { zoneId: 'B', singles: false },
        { zoneId: 'C', singles: true },
      ],
      [
        { cardId: 'x', rarity: 'common' },
        { cardId: 'y', rarity: 'epic' },
      ],
      config,
      rng
    )

    expect(state.pool).toEqual([
      { cardId: 'x', departed: 0 },
      { cardId: 'y', departed: 0 },
    ])
    expect(state.markets).toEqual([
      {
        zoneId: 'A',
        factorPercent: 110,
        singles: true,
        stock: [{ cardId: 'x', copies: 4 }],
        showcase: ['x', null],
      },
      {
        zoneId: 'B',
        factorPercent: 90,
        singles: false,
        stock: [],
        showcase: [],
      },
      {
        zoneId: 'C',
        factorPercent: 120,
        singles: true,
        stock: [
          { cardId: 'x', copies: 2 },
          { cardId: 'y', copies: 1 },
        ],
        showcase: ['y', 'x'],
      },
    ])
    expect(remaining()).toBe(0)
  })

  it('REQ-138: com mais elegíveis que o tamanho, amostra sem reposição e uniforme', () => {
    const small = {
      ...config,
      singlesPoolSize: 2,
      singlesShowcaseSlots: 1,
      singlesStockCommon: 1,
    }
    const { rng, remaining } = scriptedRng([
      [80, 120, 100],
      // amostra de 2 entre a, b, c: i=0 → c; i=1 → b
      [0, 2, 2],
      [1, 2, 1],
      // uma cópia de cada (1 mercado com singles)
      [0, 0, 0],
      [0, 0, 0],
      // vitrine: c ou b
      [0, 1, 1],
    ])

    const state = drawMarkets(
      [{ zoneId: 'A', singles: true }],
      ['a', 'b', 'c'].map((cardId) => ({ cardId, rarity: 'common' as const })),
      small,
      rng
    )

    expect(state.pool.map(({ cardId }) => cardId)).toEqual(['c', 'b'])
    expect(state.markets[0].showcase).toEqual(['b'])
    expect(remaining()).toBe(0)
  })

  it('REQ-138: sem elegíveis, o pool e as vitrines ficam vazios', () => {
    const { rng } = scriptedRng([[80, 120, 100]])

    const state = drawMarkets([{ zoneId: 'A', singles: true }], [], config, rng)

    expect(state.pool).toEqual([])
    expect(state.markets[0].showcase).toEqual([null, null])
  })
})

const market = (
  override: Partial<TMarketsState['markets'][number]> = {}
): TMarketsState['markets'][number] => ({
  zoneId: 'A',
  factorPercent: 100,
  singles: true,
  stock: [],
  showcase: [],
  ...override,
})

describe('decayMarkets', () => {
  const state: TMarketsState = {
    markets: [
      market({
        stock: [
          { cardId: 'x', copies: 2 },
          { cardId: 'y', copies: 1 },
        ],
        showcase: ['x', 'y'],
      }),
    ],
    pool: [
      { cardId: 'x', departed: 0 },
      { cardId: 'y', departed: 0 },
    ],
  }

  it('REQ-139: 1 D20 por slot; até 3 tira a cópia, soma a saída e repõe o slot', () => {
    const { rng, remaining } = scriptedRng([
      [1, 20, 3],
      [0, 0, 0], // x ainda tem 1 cópia: volta ao slot 0
      [1, 20, 4],
    ])

    const next = decayMarkets(state, [], config, rng)

    expect(next.markets[0].stock).toEqual([
      { cardId: 'x', copies: 1 },
      { cardId: 'y', copies: 1 },
    ])
    expect(next.markets[0].showcase).toEqual(['x', 'y'])
    expect(next.pool).toEqual([
      { cardId: 'x', departed: 1 },
      { cardId: 'y', departed: 0 },
    ])
    expect(remaining()).toBe(0)
  })

  it('REQ-139: a rolagem 4 não tira nada', () => {
    const { rng } = scriptedRng([
      [1, 20, 4],
      [1, 20, 20],
    ])

    expect(decayMarkets(state, [], config, rng)).toEqual(state)
  })

  it('REQ-139: não altera o estado recebido', () => {
    const before = structuredClone(state)
    const { rng } = scriptedRng([
      [1, 20, 1],
      [0, 0, 0],
      [1, 20, 1],
    ])

    decayMarkets(state, [], config, rng)

    expect(state).toEqual(before)
  })

  it('REQ-139: slot vazio não rola; mercado sem singles não rola', () => {
    const { rng, remaining } = scriptedRng([[1, 20, 20]])
    const withEmpty: TMarketsState = {
      markets: [
        market({ zoneId: 'N', singles: false }),
        market({
          stock: [{ cardId: 'x', copies: 2 }],
          showcase: [null, 'x'],
        }),
      ],
      pool: [{ cardId: 'x', departed: 0 }],
    }

    expect(decayMarkets(withEmpty, [], config, rng)).toEqual(withEmpty)
    expect(remaining()).toBe(0)
  })

  it('REQ-139: estoque global zerado tira a carta do pool; o slot fica vazio sem candidata', () => {
    const { rng } = scriptedRng([
      [1, 20, 20],
      [1, 20, 2],
    ])

    const next = decayMarkets(state, [], config, rng)

    expect(next.pool).toEqual([{ cardId: 'x', departed: 0 }])
    expect(next.markets[0].stock).toEqual([{ cardId: 'x', copies: 2 }])
    expect(next.markets[0].showcase).toEqual(['x', null])
  })

  it('REQ-139: com todas fora do pool, sorteia novo pool entre todas as elegíveis, inclusive a que saiu', () => {
    const last: TMarketsState = {
      markets: [
        market({ stock: [{ cardId: 'y', copies: 1 }], showcase: ['y', null] }),
      ],
      pool: [{ cardId: 'y', departed: 0 }],
    }
    const small = { ...config, singlesStockCommon: 1 }
    const { rng, remaining } = scriptedRng([
      [1, 20, 1],
      // novo pool: 2 elegíveis <= 20, todas, sem RNG; 1 cópia de cada
      [0, 0, 0],
      [0, 0, 0],
      // vitrine: slot 0 → y; slot 1 → p
      [0, 1, 1],
      [0, 0, 0],
      // o slot 1, agora preenchido, rola
      [1, 20, 20],
    ])

    const next = decayMarkets(
      last,
      [
        { cardId: 'p', rarity: 'common' },
        { cardId: 'y', rarity: 'common' },
      ],
      small,
      rng
    )

    expect(next.pool).toEqual([
      { cardId: 'p', departed: 0 },
      { cardId: 'y', departed: 0 },
    ])
    expect(next.markets[0].showcase).toEqual(['y', 'p'])
    expect(remaining()).toBe(0)
  })

  it('REQ-139: o novo pool no meio da rodada preenche vitrines ainda não rolada(s)', () => {
    const mid: TMarketsState = {
      markets: [
        market({
          zoneId: 'A',
          stock: [{ cardId: 'y', copies: 1 }],
          showcase: ['y'],
        }),
        market({ zoneId: 'B', showcase: [null] }),
      ],
      pool: [{ cardId: 'y', departed: 0 }],
    }
    const small = { ...config, singlesStockCommon: 1 }
    const { rng, remaining } = scriptedRng([
      [1, 20, 1], // A.0 sai
      [0, 1, 1], // a única cópia de p vai para B
      [0, 0, 0], // B.0 recebe p
      [1, 20, 20], // B.0 agora está preenchido e rola
    ])

    const next = decayMarkets(
      mid,
      [{ cardId: 'p', rarity: 'common' }],
      small,
      rng
    )

    expect(next.markets.map(({ showcase }) => showcase)).toEqual([
      [null],
      ['p'],
    ])
    expect(remaining()).toBe(0)
  })
})

describe('departSingle', () => {
  it('REQ-139: a compra tira a cópia do mercado e a soma às saídas; a carta fica no pool se há estoque em outro mercado', () => {
    const state: TMarketsState = {
      markets: [
        market({
          zoneId: 'A',
          stock: [{ cardId: 'x', copies: 1 }],
          showcase: ['x'],
        }),
        market({
          zoneId: 'B',
          stock: [{ cardId: 'x', copies: 1 }],
          showcase: [null],
        }),
      ],
      pool: [{ cardId: 'x', departed: 1 }],
    }
    const { rng, remaining } = scriptedRng([])

    const next = departSingle(state, 0, 0, [], config, rng)

    expect(next.markets[0]).toMatchObject({ stock: [], showcase: [null] })
    expect(next.markets[1].stock).toEqual([{ cardId: 'x', copies: 1 }])
    expect(next.pool).toEqual([{ cardId: 'x', departed: 2 }])
    expect(remaining()).toBe(0)
  })
})
