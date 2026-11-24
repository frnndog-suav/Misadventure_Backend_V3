import { describe, expect, it } from 'vitest'

import type { SeededRng } from '@/core/rng/seeded-rng'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'

import type { TPlayerState } from '../entities/party-member'
import type { TMarketOperation } from '../party-action'
import { capacitiesOf, noExpansions, type TMarketsState } from '../markets'
import {
  applyMarketOperations,
  describeMarket,
  marketBoosters,
  sellOffersOf,
  sellValue,
  servicesOf,
  singlePrice,
  stockPurchasePrice,
} from '.'

const config = { ...GAME_CONFIG_DEFAULTS }
const ZONE = 'fixture.gray-harbor'

const P = makeItemCard({ id: 'fixture.healing-potion', stockPrice: 6 })
const A = makeItemCard({
  id: 'fixture.arrows',
  stockPrice: 3,
  stockQuantity: 10,
})
const F = makeItemCard({
  id: 'fixture.fishing-rod',
  itemCategory: 'tool',
  stockPrice: 20,
})
const BO = makeItemCard({
  id: 'fixture.booster',
  itemCategory: 'booster',
  boosterCollectionId: 'fixture',
})
const OTHER_BOOSTER = makeItemCard({
  id: 'fixture.other-booster',
  itemCategory: 'booster',
  boosterCollectionId: 'other',
})
const C = makeItemCard({
  id: 'fixture.lucky-coin',
  itemCategory: 'treasure',
  rarity: 'uncommon',
})
const PICKAXE = makeItemCard({ id: 'fixture.pickaxe', itemCategory: 'tool' })
const W = makeEquipmentCard({
  id: 'fixture.short-sword',
  rarity: 'common',
  priceMultiplier: 1.2,
})
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const EPIC = makeAttributeCard({
  id: 'fixture.epic-focus',
  rarity: 'epic',
  priceMultiplier: 1.5,
})

const cardsOf = (...list: TCard[]) => new Map(list.map((c) => [c.id, c]))
const ALL = cardsOf(P, A, F, BO, OTHER_BOOSTER, C, PICKAXE, W, STR, EPIC)

type TStep = readonly [min: number, max: number, value: number]

/** RNG com chamadas `nextInt(min, max)` roteirizadas (confere faixa e fim do roteiro). */
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

function state(
  override: Partial<TMarketsState['markets'][number]> = {}
): TMarketsState {
  return {
    markets: [
      {
        zoneId: ZONE,
        factorPercent: 100,
        singles: true,
        stock: [{ cardId: W.id, copies: 3 }],
        showcase: [W.id, null],
        ...override,
      },
    ],
    pool: [{ cardId: W.id, departed: 0 }],
  }
}

function apply(
  operations: TMarketOperation[],
  options: {
    player?: Parameters<typeof makePlayerState>[0]
    market?: TMarketsState
    steps?: readonly TStep[]
    config?: typeof config
  } = {}
) {
  const script = scriptedRng(options.steps ?? [])
  const player = makePlayerState({ gold: 100, ...options.player })
  const result = applyMarketOperations({
    player,
    config: options.config ?? config,
    cards: ALL,
    operations,
    zoneId: ZONE,
    zoneStock: [P.id, A.id, F.id],
    collectionId: 'fixture',
    state: options.market ?? state(),
    candidates: [{ cardId: W.id, rarity: 'common' }],
    rng: script.rng,
  })
  return { result, script, player }
}

describe('preços (REQ-141, REQ-142; D-119)', () => {
  it('REQ-141: estoque = ⌈stockPrice × fator⌉ (6 a 115 → 7; 3 → 4; 20 → 23)', () => {
    expect(stockPurchasePrice(6, 115)).toBe(7)
    expect(stockPurchasePrice(3, 115)).toBe(4)
    expect(stockPurchasePrice(20, 115)).toBe(23)
    expect(stockPurchasePrice(6, 100)).toBe(6)
  })

  it('REQ-141: single Comum 5 × 1,2 × 0,9 → 6 sem saídas e 7 com 2 saídas (sem erro de ponto flutuante)', () => {
    expect(singlePrice(config, W, 90, 0)).toBe(6)
    expect(singlePrice(config, W, 90, 2)).toBe(7)
    expect(singlePrice(config, W, 100, 0)).toBe(6)
    expect(singlePrice(config, W, 100, 1)).toBe(7)
  })

  it('REQ-141: single Épica 130 × 1,5 × 1,2 × 1,1 arredonda para cima', () => {
    // 130 × 150 × 120 × 110 / 1.000.000 = 257,4 → 258
    expect(singlePrice(config, EPIC, 120, 1)).toBe(258)
  })

  it('REQ-142: valor de venda por tipo de carta', () => {
    expect(sellValue(config, P)).toEqual({ price: 3, lotSize: 1 })
    expect(sellValue(config, A)).toEqual({ price: 1, lotSize: 10 })
    expect(sellValue(config, C)).toEqual({ price: 25, lotSize: 1 })
    expect(sellValue(config, BO)).toEqual({ price: 15, lotSize: 1 })
    // Comum × 1,2 → ⌊0,5 × 5 × 1,2⌋ = 3
    expect(sellValue(config, W)).toEqual({ price: 3, lotSize: 1 })
    expect(sellValue(config, STR)).toEqual({ price: 2, lotSize: 1 })
    expect(sellValue(config, PICKAXE)).toEqual({ price: 2, lotSize: 1 })
  })

  it('REQ-142: a venda vale no mínimo 1 por unidade', () => {
    const cheap = { ...config, singlesPriceCommon: 1 }
    expect(sellValue(cheap, STR)).toEqual({ price: 1, lotSize: 1 })
  })

  it('REQ-142: carta que não é de atributo, equipamento ou item não se vende', () => {
    expect(sellValue(config, { type: 'zone' } as unknown as TCard)).toBeNull()
  })
})

describe('serviços e capacidades (REQ-143; D-120)', () => {
  it('REQ-143: os cinco serviços no padrão e depois de 1 compra da bolsa', () => {
    expect(servicesOf(config)).toEqual([
      { expansion: 'vaultSlots', price: 50, capacity: 35 },
      { expansion: 'deckSlots', price: 100, capacity: 11 },
      { expansion: 'tcgFolder', price: 60, capacity: 40 },
      { expansion: 'purse', price: 150, capacity: 600 },
      { expansion: 'vaultGold', price: 500, capacity: 4000 },
    ])
    const bought = {
      vaultSlots: 1,
      deckSlots: 0,
      tcgFolder: 2,
      purse: 1,
      vaultGold: 0,
    }
    expect(servicesOf(config, bought)).toEqual([
      { expansion: 'vaultSlots', price: 100, capacity: 40 },
      { expansion: 'deckSlots', price: 100, capacity: 11 },
      { expansion: 'tcgFolder', price: 240, capacity: 60 },
      { expansion: 'purse', price: 300, capacity: 1200 },
      { expansion: 'vaultGold', price: 500, capacity: 4000 },
    ])
    expect(capacitiesOf(config, bought)).toEqual({
      vaultSlots: 35,
      deckSlots: 10,
      tcgFolder: 50,
      purse: 600,
      vaultGold: 2000,
    })
  })
})

describe('boosters e ofertas de venda (REQ-140)', () => {
  it('REQ-141: boosters são só os da coleção vigente, em ordem de id', () => {
    expect(marketBoosters(ALL, 'fixture').map(({ id }) => id)).toEqual([
      'fixture.booster',
    ])
    expect(marketBoosters(ALL, null)).toEqual([])
  })

  it('REQ-142, REQ-154: ofertas do inventário (agregado, na ordem dos slots; equipamento por cópia) e depois da pasta; lote incompleto não entra', () => {
    const offers = sellOffersOf(
      config,
      {
        inventory: [
          { cardId: W.id, quantity: 1 },
          { cardId: A.id, quantity: 20 },
          { cardId: W.id, quantity: 1 },
          { cardId: F.id, quantity: 1 },
        ],
        tcgFolder: [{ cardId: STR.id, copies: 2 }],
      },
      ALL
    )

    const standard = {
      refinement: 0,
      enchantments: [],
      repairMarks: 0,
      broken: false,
    }
    expect(offers).toEqual([
      {
        source: 'inventory',
        cardId: W.id,
        owned: 1,
        lotSize: 1,
        price: 3,
        inventorySlotIndex: 0,
        equipmentState: standard,
      },
      { source: 'inventory', cardId: A.id, owned: 20, lotSize: 10, price: 1 },
      {
        source: 'inventory',
        cardId: W.id,
        owned: 1,
        lotSize: 1,
        price: 3,
        inventorySlotIndex: 2,
        equipmentState: standard,
      },
      { source: 'inventory', cardId: F.id, owned: 1, lotSize: 1, price: 10 },
      { source: 'tcgFolder', cardId: STR.id, owned: 2, lotSize: 1, price: 2 },
    ])
    expect(
      sellOffersOf(
        config,
        { inventory: [{ cardId: A.id, quantity: 9 }], tcgFolder: [] },
        ALL
      )
    ).toEqual([])
  })
})

describe('describeMarket (REQ-140; D-124)', () => {
  const player = makePlayerState({ gold: 100 })

  it('REQ-140: estoque com o fator, boosters, vitrine com preço e destino, serviços e vendas', () => {
    const view = describeMarket({
      config,
      player,
      cards: ALL,
      zoneId: ZONE,
      zoneStock: [P.id, A.id, F.id],
      collectionId: 'fixture',
      state: state({ factorPercent: 115, showcase: [W.id, null] }),
    })

    expect(view.factorPercent).toBe(115)
    expect(view.stock).toEqual([
      { cardId: P.id, price: 7, copiesPerPurchase: 1 },
      { cardId: A.id, price: 4, copiesPerPurchase: 10 },
      { cardId: F.id, price: 23, copiesPerPurchase: 1 },
    ])
    expect(view.boosters).toEqual([{ cardId: BO.id, price: 30 }])
    // 5 × 1,2 × 1,15 = 6,9 → 7
    expect(view.showcase).toEqual([
      {
        slotIndex: 0,
        offer: { cardId: W.id, price: 7, destination: 'inventory' },
      },
      { slotIndex: 1, offer: null },
    ])
    expect(view.services).toHaveLength(5)
    expect(view.sellOffers).toEqual([])
  })

  it('D-124: item do estoque fora do catálogo publicado não aparece', () => {
    const view = describeMarket({
      config,
      player,
      cards: cardsOf(P),
      zoneId: ZONE,
      zoneStock: [P.id, A.id],
      collectionId: 'fixture',
      state: state(),
    })

    expect(view.stock.map(({ cardId }) => cardId)).toEqual([P.id])
  })

  it('CONTRATO v0.79: save sem mercado sorteado → fator 100 e sem vitrine', () => {
    const view = describeMarket({
      config,
      player,
      cards: ALL,
      zoneId: ZONE,
      zoneStock: [P.id],
      collectionId: 'fixture',
      state: { markets: [], pool: [] },
    })

    expect(view.factorPercent).toBe(100)
    expect(view.showcase).toBeNull()
    expect(view.stock).toEqual([
      { cardId: P.id, price: 6, copiesPerPurchase: 1 },
    ])
  })

  it('REQ-140: mercado sem singles → showcase null', () => {
    const view = describeMarket({
      config,
      player,
      cards: ALL,
      zoneId: ZONE,
      zoneStock: [],
      collectionId: 'fixture',
      state: state({ singles: false, showcase: [] }),
    })

    expect(view.showcase).toBeNull()
  })
})

describe('applyMarketOperations — compras (REQ-141)', () => {
  it('REQ-141: buyStock — 2 compras de flechas (lote de 10) a fator 115 → 20 cópias por 8 ouro', () => {
    const { result } = apply(
      [{ operation: 'buyStock', cardId: A.id, quantity: 2 }],
      { market: state({ factorPercent: 115 }) }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(92)
    expect(result.value.player.inventory).toEqual([
      { cardId: A.id, quantity: 20 },
    ])
    expect(result.value.result).toEqual({
      zoneId: ZONE,
      goldLost: 0,
      results: [
        {
          operation: 'buyStock',
          cardId: A.id,
          quantity: 2,
          copiesReceived: 20,
          gold: -8,
        },
      ],
    })
  })

  it('REQ-141: buyStock de item fora do estoque ou sem stockPrice → notInMarketStock', () => {
    for (const cardId of [PICKAXE.id, 'ghost']) {
      const { result } = apply([{ operation: 'buyStock', cardId, quantity: 1 }])
      expect(result.isLeft() && result.value).toEqual({
        reason: 'notInMarketStock',
        operationIndex: 0,
        cardId,
      })
    }
  })

  it('REQ-141: buyBooster — só da coleção vigente, 30 sem fator, no inventário', () => {
    const { result } = apply(
      [{ operation: 'buyBooster', cardId: BO.id, quantity: 2 }],
      { market: state({ factorPercent: 120 }) }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(40)
    expect(result.value.player.inventory).toEqual([
      { cardId: BO.id, quantity: 2 },
    ])
    const other = apply([
      { operation: 'buyBooster', cardId: OTHER_BOOSTER.id, quantity: 1 },
    ]).result
    expect(other.isLeft() && other.value.reason).toBe('notMarketBooster')
  })

  it('REQ-141: ouro insuficiente → notEnoughGold; sem espaço → inventoryFull (compra não abre a escolha de 6.6)', () => {
    const poor = apply([{ operation: 'buyStock', cardId: F.id, quantity: 1 }], {
      player: { gold: 19 },
    }).result
    expect(poor.isLeft() && poor.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 0,
      cardId: F.id,
    })

    const full = apply([{ operation: 'buyStock', cardId: F.id, quantity: 1 }], {
      player: {
        inventory: Array.from({ length: config.inventoryCapacity }, (_, i) => ({
          cardId: `slot-${i}`,
          quantity: 1,
        })),
      },
    }).result
    expect(full.isLeft() && full.value.reason).toBe('inventoryFull')
  })

  it('REQ-141: buySingle — equipamento vai ao inventário, tira a cópia, repõe o slot e soma a saída', () => {
    const { result, script } = apply(
      [{ operation: 'buySingle', slotIndex: 0 }],
      // reposição: uma opção (W) → nextInt(0, 0)
      { steps: [[0, 0, 0]] }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(94)
    expect(result.value.player.inventory).toEqual([
      { cardId: W.id, quantity: 1 },
    ])
    expect(result.value.state.markets[0].stock).toEqual([
      { cardId: W.id, copies: 2 },
    ])
    expect(result.value.state.markets[0].showcase).toEqual([W.id, null])
    expect(result.value.state.pool).toEqual([{ cardId: W.id, departed: 1 }])
    expect(result.value.result.results).toEqual([
      {
        operation: 'buySingle',
        slotIndex: 0,
        cardId: W.id,
        destination: 'inventory',
        gold: -6,
      },
    ])
    expect(script.remaining()).toBe(0)
  })

  it('D-118: dois singles do mesmo slot no lote — o segundo vê a reposição e a escassez (6 e depois 7)', () => {
    const { result } = apply(
      [
        { operation: 'buySingle', slotIndex: 0 },
        { operation: 'buySingle', slotIndex: 0 },
      ],
      {
        steps: [
          [0, 0, 0],
          [0, 0, 0],
        ],
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(87)
    expect(result.value.result.results.map(({ gold }) => gold)).toEqual([
      -6, -7,
    ])
  })

  it('REQ-141: single de atributo vai para a pasta de TCG (em ordem de id); pasta cheia → tcgFolderFull', () => {
    const market = state({
      stock: [{ cardId: STR.id, copies: 2 }],
      showcase: [STR.id, null],
    })
    const pool = { ...market, pool: [{ cardId: STR.id, departed: 0 }] }

    const { result } = apply([{ operation: 'buySingle', slotIndex: 0 }], {
      market: pool,
      player: { tcgFolder: [{ cardId: 'fixture.a-card', copies: 1 }] },
      steps: [[0, 0, 0]],
    })
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.tcgFolder).toEqual([
      { cardId: 'fixture.a-card', copies: 1 },
      { cardId: STR.id, copies: 1 },
    ])
    expect(result.value.result.results[0]).toMatchObject({
      destination: 'tcgFolder',
    })

    const full = apply([{ operation: 'buySingle', slotIndex: 0 }], {
      market: pool,
      player: {
        tcgFolder: [
          { cardId: 'fixture.a-card', copies: config.tcgFolderCapacity },
        ],
      },
    }).result
    expect(full.isLeft() && full.value).toEqual({
      reason: 'tcgFolderFull',
      operationIndex: 0,
      cardId: STR.id,
    })
  })

  it('REQ-141: singlesUnavailable, showcaseSlotNotFound e showcaseSlotEmpty', () => {
    const noSingles = apply([{ operation: 'buySingle', slotIndex: 0 }], {
      market: state({ singles: false, showcase: [] }),
    }).result
    expect(noSingles.isLeft() && noSingles.value).toEqual({
      reason: 'singlesUnavailable',
      operationIndex: 0,
    })
    const legacy = apply([{ operation: 'buySingle', slotIndex: 0 }], {
      market: { markets: [], pool: [] },
    }).result
    expect(legacy.isLeft() && legacy.value.reason).toBe('singlesUnavailable')

    const notFound = apply([{ operation: 'buySingle', slotIndex: 2 }]).result
    expect(notFound.isLeft() && notFound.value.reason).toBe(
      'showcaseSlotNotFound'
    )
    const empty = apply([{ operation: 'buySingle', slotIndex: 1 }]).result
    expect(empty.isLeft() && empty.value.reason).toBe('showcaseSlotEmpty')
  })

  it('REQ-141: single sem ouro → notEnoughGold com a carta', () => {
    const { result } = apply([{ operation: 'buySingle', slotIndex: 0 }], {
      player: { gold: 5 },
    })

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 0,
      cardId: W.id,
    })
  })
})

describe('applyMarketOperations — venda (REQ-142)', () => {
  it('REQ-142: vender do inventário e da pasta credita o ouro e tira as cartas', () => {
    const { result } = apply(
      [
        { operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 },
        { operation: 'sell', source: 'inventory', cardId: W.id, quantity: 1 },
        { operation: 'sell', source: 'tcgFolder', cardId: STR.id, quantity: 2 },
      ],
      {
        player: {
          gold: 0,
          inventory: [
            { cardId: C.id, quantity: 1 },
            { cardId: W.id, quantity: 1 },
          ],
          tcgFolder: [{ cardId: STR.id, copies: 2 }],
        },
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(25 + 3 + 4)
    expect(result.value.player.inventory).toEqual([])
    expect(result.value.player.tcgFolder).toEqual([])
    expect(result.value.result.results.map(({ gold }) => gold)).toEqual([
      25, 3, 4,
    ])
  })

  it('REQ-142: lote de estoque — 20 flechas → 2 lotes a 1 ouro; 15 → notLotMultiple', () => {
    const player = { inventory: [{ cardId: A.id, quantity: 20 }] }
    const bad = apply(
      [{ operation: 'sell', source: 'inventory', cardId: A.id, quantity: 15 }],
      { player }
    ).result
    expect(bad.isLeft() && bad.value).toEqual({
      reason: 'notLotMultiple',
      operationIndex: 0,
      cardId: A.id,
    })

    const ok = apply(
      [{ operation: 'sell', source: 'inventory', cardId: A.id, quantity: 10 }],
      { player }
    ).result
    expect(ok.isRight()).toBe(true)
    if (!ok.isRight()) return
    expect(ok.value.player.gold).toBe(101)
    expect(ok.value.player.inventory).toEqual([{ cardId: A.id, quantity: 10 }])
  })

  it('REQ-142: o ouro acima da bolsa é perdido e informado (290 + 25 → 300, perdidos 15)', () => {
    const { result } = apply(
      [{ operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 }],
      {
        player: { gold: 290, inventory: [{ cardId: C.id, quantity: 1 }] },
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(300)
    expect(result.value.result.goldLost).toBe(15)
    expect(result.value.result.results[0]).toMatchObject({ gold: 25 })
  })

  it('REQ-142: a perda soma as vendas do lote, cada uma limitada pela bolsa naquele momento', () => {
    const { result } = apply(
      [
        { operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 },
        { operation: 'sell', source: 'inventory', cardId: BO.id, quantity: 1 },
      ],
      {
        player: {
          gold: 295,
          inventory: [
            { cardId: C.id, quantity: 1 },
            { cardId: BO.id, quantity: 1 },
          ],
        },
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(300)
    expect(result.value.result.goldLost).toBe(20 + 15)
  })

  it('REQ-142: sem a carta (ou sem catálogo) → notInInventory / notInTcgFolder', () => {
    const inventory = apply([
      { operation: 'sell', source: 'inventory', cardId: W.id, quantity: 1 },
    ]).result
    expect(inventory.isLeft() && inventory.value).toEqual({
      reason: 'notInInventory',
      operationIndex: 0,
      cardId: W.id,
    })
    const folder = apply([
      { operation: 'sell', source: 'tcgFolder', cardId: STR.id, quantity: 1 },
    ]).result
    expect(folder.isLeft() && folder.value.reason).toBe('notInTcgFolder')
    const unknown = apply(
      [
        {
          operation: 'sell',
          source: 'inventory',
          cardId: 'ghost',
          quantity: 1,
        },
      ],
      { player: { inventory: [{ cardId: 'ghost', quantity: 1 }] } }
    ).result
    expect(unknown.isLeft() && unknown.value.reason).toBe('notInInventory')
  })

  it('REQ-142: venda de equipamento tira só uma cópia e deixa as outras', () => {
    const { result } = apply(
      [{ operation: 'sell', source: 'inventory', cardId: W.id, quantity: 1 }],
      {
        player: {
          inventory: [
            { cardId: W.id, quantity: 1 },
            { cardId: W.id, quantity: 1 },
          ],
        },
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.inventory).toEqual([
      { cardId: W.id, quantity: 1 },
    ])
  })
})

describe('venda de equipamento modificado (REQ-154; D-141)', () => {
  const FIRE = {
    id: 'fixture.fire-edge',
    name: 'Fio de Fogo',
    materials: [],
    kind: 'element' as const,
    element: 'fire' as const,
    bonusPercent: 10,
  }
  const SWORD = makeEquipmentCard({
    id: 'fixture.short-sword',
    rarity: 'common',
    priceMultiplier: 1.2,
    enchantment: {
      slots: [
        { kind: 'element', minRefinement: 2 },
        { kind: 'element', minRefinement: 7 },
      ],
    },
  })
  const swordCards = cardsOf(SWORD)
  const applied = (slotIndex: number | null) => ({
    enchantment: FIRE,
    zoneId: ZONE,
    slotIndex,
  })
  const modified = (override: object = {}) => ({
    refinement: 5,
    enchantments: [applied(0)],
    repairMarks: 1,
    broken: false,
    ...override,
  })

  it('REQ-154: Comum × 1,2 em +5 com 1 encantamento ligado e 1 reparo → ⌊3 × 1,6 × 0,88⌋ = 4', () => {
    expect(sellValue(config, SWORD, modified())).toEqual({
      price: 4,
      lotSize: 1,
    })
  })

  it('REQ-154: quebrado → 0; 9 reparos → 0 (sem o mínimo 1); encantamento desligado não valoriza', () => {
    expect(sellValue(config, SWORD, modified({ broken: true }))?.price).toBe(0)
    expect(sellValue(config, SWORD, modified({ repairMarks: 9 }))?.price).toBe(
      0
    )
    // slot 1 exige +7: desligado em +5 → ⌊3 × 1,4 × 0,88⌋ = 3
    expect(
      sellValue(config, SWORD, modified({ enchantments: [applied(1)] }))?.price
    ).toBe(3)
    // o extra do Ferreiro Arcano está sempre ligado
    expect(
      sellValue(
        config,
        SWORD,
        modified({ enchantments: [applied(0), applied(null)] })
      )?.price
    ).toBe(4) // ⌊3 × 1,8 × 0,88⌋ = ⌊4,75⌋
  })

  it('REQ-154: o mínimo 1 vale com fator de reparo > 0', () => {
    const cheap = { ...config, singlesPriceCommon: 1 }
    expect(
      sellValue(cheap, SWORD, modified({ refinement: 0, enchantments: [] }))
        ?.price
    ).toBe(1)
  })

  it('REQ-154: as porcentagens vêm da configuração', () => {
    const custom = { ...config, saleRefinePercent: 0, saleEnchantPercent: 0 }
    // ⌊3 × 1 × 0,88⌋ = 2
    expect(sellValue(custom, SWORD, modified())?.price).toBe(2)
  })

  it('REQ-154: oferta de cópia modificada traz o estado e o preço dela', () => {
    const offers = sellOffersOf(
      config,
      {
        inventory: [
          { cardId: SWORD.id, quantity: 1, equipmentState: modified() },
        ],
        tcgFolder: [],
      },
      swordCards
    )
    expect(offers).toEqual([
      {
        source: 'inventory',
        cardId: SWORD.id,
        owned: 1,
        lotSize: 1,
        price: 4,
        inventorySlotIndex: 0,
        equipmentState: modified(),
      },
    ])
  })

  it('REQ-154: equipamento de valor 0 continua na oferta e vende por 0', () => {
    const broken = modified({ broken: true })
    const inventory = [
      { cardId: SWORD.id, quantity: 1, equipmentState: broken },
    ]
    expect(
      sellOffersOf(config, { inventory, tcgFolder: [] }, swordCards)[0].price
    ).toBe(0)
    const result = applyMarketOperations({
      player: makePlayerState({ gold: 10, inventory }),
      config,
      cards: swordCards,
      operations: [
        {
          operation: 'sell',
          source: 'inventory',
          cardId: SWORD.id,
          quantity: 1,
        },
      ],
      zoneId: ZONE,
      zoneStock: [],
      collectionId: null,
      state: state(),
      candidates: [],
      rng: scriptedRng([]).rng,
    })
    expect(result.isRight() && result.value.player).toMatchObject({
      gold: 10,
      inventory: [],
    })
    expect(result.isRight() && result.value.result.results[0].gold).toBe(0)
  })

  function sell(
    operations: TMarketOperation[],
    inventory: TPlayerState['inventory'],
    gold = 0
  ) {
    return applyMarketOperations({
      player: makePlayerState({ gold, inventory }),
      config,
      cards: cardsOf(SWORD, P),
      operations,
      zoneId: ZONE,
      zoneStock: [P.id],
      collectionId: null,
      state: state(),
      candidates: [],
      rng: scriptedRng([]).rng,
    })
  }

  it('REQ-154: sem inventorySlotIndex vende primeiro as cópias de estado padrão; várias cópias somam o preço de cada uma', () => {
    const inventory = [
      { cardId: SWORD.id, quantity: 1, equipmentState: modified() },
      { cardId: SWORD.id, quantity: 1 },
      { cardId: SWORD.id, quantity: 1 },
    ]
    const one = sell(
      [
        {
          operation: 'sell',
          source: 'inventory',
          cardId: SWORD.id,
          quantity: 1,
        },
      ],
      inventory
    )
    expect(one.isRight() && one.value.player.inventory).toEqual([
      inventory[0],
      inventory[2],
    ])
    const all = sell(
      [
        {
          operation: 'sell',
          source: 'inventory',
          cardId: SWORD.id,
          quantity: 3,
        },
      ],
      inventory
    )
    expect(all.isRight() && all.value.player.gold).toBe(3 + 3 + 4)
    expect(all.isRight() && all.value.result.results[0].gold).toBe(10)
  })

  it('D-141: inventorySlotIndex vende a cópia daquele slot do inventário de antes do lote', () => {
    const inventory = [
      { cardId: SWORD.id, quantity: 1 },
      { cardId: P.id, quantity: 1 },
      { cardId: SWORD.id, quantity: 1, equipmentState: modified() },
    ]
    const result = sell(
      [
        { operation: 'sell', source: 'inventory', cardId: P.id, quantity: 1 },
        { operation: 'buyStock', cardId: P.id, quantity: 1 },
        {
          operation: 'sell',
          source: 'inventory',
          cardId: SWORD.id,
          quantity: 1,
          inventorySlotIndex: 2,
        },
      ],
      inventory,
      10
    )
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.inventory).toEqual([
      { cardId: SWORD.id, quantity: 1 },
      { cardId: P.id, quantity: 1 },
    ])
    expect(result.value.result.results[2].gold).toBe(4)
  })

  it('D-141: inventorySlotIndex inválido → notInInventory (slot inexistente, já vendido, outra carta, quantity ≠ 1, pasta, não equipamento)', () => {
    const inventory = [
      { cardId: SWORD.id, quantity: 1 },
      { cardId: P.id, quantity: 2 },
    ]
    const op = (override: object) =>
      ({
        operation: 'sell',
        source: 'inventory',
        cardId: SWORD.id,
        quantity: 1,
        inventorySlotIndex: 0,
        ...override,
      }) as TMarketOperation
    const refusals = [
      [op({ inventorySlotIndex: 5 })],
      [op({}), op({})],
      [op({ inventorySlotIndex: 1 })],
      [op({ quantity: 2 })],
      [op({ source: 'tcgFolder' })],
      [op({ cardId: P.id, inventorySlotIndex: 1 })],
    ].map((operations) => {
      const result = sell(operations, inventory)
      return result.isLeft() && result.value.reason
    })
    expect(refusals).toEqual([
      'notInInventory',
      'notInInventory',
      'notInInventory',
      'notInInventory',
      'notInInventory',
      'notInInventory',
    ])
  })
})

describe('applyMarketOperations — lote (D-118)', () => {
  it('REQ-140: a primeira operação recusada dá o índice e nada do jogador muda', () => {
    const { result, player } = apply([
      { operation: 'buyBooster', cardId: BO.id, quantity: 1 },
      { operation: 'buyStock', cardId: P.id, quantity: 20 },
    ])

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 1,
      cardId: P.id,
    })
    expect(player.gold).toBe(100)
    expect(player.inventory).toEqual([])
  })

  it('REQ-140: operações dependentes — vender e comprar no mesmo lote usa o ouro da venda', () => {
    const { result } = apply(
      [
        { operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 },
        { operation: 'buyStock', cardId: F.id, quantity: 1 },
      ],
      { player: { gold: 0, inventory: [{ cardId: C.id, quantity: 1 }] } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(5)
  })
})

describe('applyMarketOperations — expansões (REQ-143; D-120)', () => {
  it('REQ-143: vaultSlots a 50, depois a 100 no mesmo lote; grava a contagem e informa a capacidade depois da compra', () => {
    const { result } = apply(
      [
        { operation: 'buyExpansion', expansion: 'vaultSlots' },
        { operation: 'buyExpansion', expansion: 'vaultSlots' },
      ],
      { player: { gold: 150 } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(0)
    expect(result.value.player.expansions?.vaultSlots).toBe(2)
    expect(result.value.result.results).toEqual([
      {
        operation: 'buyExpansion',
        expansion: 'vaultSlots',
        capacity: 35,
        gold: -50,
      },
      {
        operation: 'buyExpansion',
        expansion: 'vaultSlots',
        capacity: 40,
        gold: -100,
      },
    ])
    expect(result.value.result.goldLost).toBe(0)
  })

  it('REQ-143: deckSlots (100, 200) e tcgFolder (60, 120) seguem base × 2^compras', () => {
    const { result } = apply(
      [
        { operation: 'buyExpansion', expansion: 'deckSlots' },
        { operation: 'buyExpansion', expansion: 'deckSlots' },
        { operation: 'buyExpansion', expansion: 'tcgFolder' },
        { operation: 'buyExpansion', expansion: 'tcgFolder' },
      ],
      { player: { gold: 480 } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(0)
    expect(result.value.result.results.map((r) => r.gold)).toEqual([
      -100, -200, -60, -120,
    ])
    expect(result.value.player.expansions).toMatchObject({
      deckSlots: 2,
      tcgFolder: 2,
    })
  })

  it('REQ-143: bolsa 300 → 600 por 150; a 2ª compra custa 300 e leva a 1200', () => {
    const { result } = apply(
      [
        { operation: 'buyExpansion', expansion: 'purse' },
        { operation: 'buyExpansion', expansion: 'purse' },
      ],
      { player: { gold: 450 } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.result.results).toEqual([
      {
        operation: 'buyExpansion',
        expansion: 'purse',
        capacity: 600,
        gold: -150,
      },
      {
        operation: 'buyExpansion',
        expansion: 'purse',
        capacity: 1200,
        gold: -300,
      },
    ])
  })

  it('REQ-143: a 1ª expansão do ouro do cofre (500) com a bolsa padrão (300) → notEnoughGold, índice e sem efeito', () => {
    const { result, player } = apply(
      [{ operation: 'buyExpansion', expansion: 'vaultGold' }],
      { player: { gold: 300 } }
    )

    expect(result.isLeft() && result.value).toEqual({
      reason: 'notEnoughGold',
      operationIndex: 0,
    })
    expect(player.gold).toBe(300)
    expect(player.expansions).toEqual({
      vaultSlots: 0,
      deckSlots: 0,
      tcgFolder: 0,
      purse: 0,
      vaultGold: 0,
    })
  })

  it('REQ-143: com a bolsa a 600 o ouro do cofre custa 500 e leva a 4000', () => {
    const { result } = apply(
      [{ operation: 'buyExpansion', expansion: 'vaultGold' }],
      { player: { gold: 600, expansions: { ...noExpansions(), purse: 1 } } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(100)
    expect(result.value.result.results).toEqual([
      {
        operation: 'buyExpansion',
        expansion: 'vaultGold',
        capacity: 4000,
        gold: -500,
      },
    ])
  })

  it('REQ-143: a bolsa expandida vale na venda do mesmo lote (nada se perde até 600)', () => {
    const { result } = apply(
      [
        { operation: 'buyExpansion', expansion: 'purse' },
        { operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 },
      ],
      { player: { gold: 450, inventory: [{ cardId: C.id, quantity: 1 }] } }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(300 + 25)
    expect(result.value.result.goldLost).toBe(0)
  })

  it('REQ-143: a bolsa já expandida (600) vale na venda: 590 + 25 → 600 e perde 15', () => {
    const { result } = apply(
      [{ operation: 'sell', source: 'inventory', cardId: C.id, quantity: 1 }],
      {
        player: {
          gold: 590,
          inventory: [{ cardId: C.id, quantity: 1 }],
          expansions: { ...noExpansions(), purse: 1 },
        },
      }
    )

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(600)
    expect(result.value.result.goldLost).toBe(15)
  })
})
