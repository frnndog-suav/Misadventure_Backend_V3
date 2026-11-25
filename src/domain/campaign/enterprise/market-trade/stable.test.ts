import { describe, expect, it } from 'vitest'

import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import {
  makeAttributeCard,
  makeMountCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'

import { noExpansions, type TMarketsState } from '../markets'
import type { TMountState } from '../mount'
import type { TMarketOperation } from '../party-action'
import { applyMarketOperations, describeMarket } from '.'

const config = { ...GAME_CONFIG_DEFAULTS }
const ZONE = 'fixture.old-mine'
const H = makeMountCard({ id: 'fixture.plow-horse', rarity: 'rare' })
const PONY = makeMountCard({ id: 'fixture.war-pony', rarity: 'common' })
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const cards = new Map<string, TCard>([H, PONY, STR].map((c) => [c.id, c]))

const state = (factorPercent = 115): TMarketsState => ({
  markets: [
    { zoneId: ZONE, factorPercent, singles: false, stock: [], showcase: [] },
  ],
  pool: [],
})

const emptyMount = (cardId = H.id): TMountState => ({
  cardId,
  inventory: [],
  tcgFolder: [],
})

const noRng = {
  nextInt: () => {
    throw new Error('RNG não deve ser usado')
  },
}

function apply(
  operations: TMarketOperation[],
  player: Parameters<typeof makePlayerState>[0],
  zoneMounts: readonly string[] = [H.id]
) {
  return applyMarketOperations({
    player: makePlayerState(player),
    config,
    cards,
    operations,
    zoneId: ZONE,
    zoneStock: [],
    zoneMounts,
    collectionId: 'fixture',
    state: state(),
    candidates: [],
    rng: noRng,
  })
}

describe('Estábulo — compra (REQ-158 a)', () => {
  it('REQ-158: Rara 280 × 115 → 322; a montaria chega vazia', () => {
    const result = apply([{ operation: 'buyMount', cardId: H.id }], {
      gold: 400,
    })
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(78)
    expect(result.value.player.mount).toEqual(emptyMount())
    expect(result.value.result.results).toEqual([
      { operation: 'buyMount', cardId: H.id, gold: -322 },
    ])
  })

  it('REQ-158: zona sem Estábulo ou montaria fora da lista → mountNotOffered', () => {
    expect(
      apply([{ operation: 'buyMount', cardId: H.id }], { gold: 400 }, []).value
    ).toEqual({
      reason: 'mountNotOffered',
      operationIndex: 0,
      cardId: H.id,
    })
    expect(
      apply([{ operation: 'buyMount', cardId: PONY.id }], { gold: 400 }).value
    ).toMatchObject({ reason: 'mountNotOffered' })
  })

  it('REQ-158: com montaria (inclusive comprada no mesmo lote) → mountAlreadyOwned', () => {
    expect(
      apply([{ operation: 'buyMount', cardId: H.id }], {
        gold: 400,
        mount: emptyMount(PONY.id),
      }).value
    ).toEqual({
      reason: 'mountAlreadyOwned',
      operationIndex: 0,
      cardId: H.id,
    })
    expect(
      apply(
        [
          { operation: 'buyMount', cardId: H.id },
          { operation: 'buyMount', cardId: H.id },
        ],
        { gold: 1000 }
      ).value
    ).toMatchObject({ reason: 'mountAlreadyOwned', operationIndex: 1 })
  })

  it('REQ-158: ouro insuficiente → notEnoughGold', () => {
    expect(
      apply([{ operation: 'buyMount', cardId: H.id }], { gold: 321 }).value
    ).toEqual({ reason: 'notEnoughGold', operationIndex: 0, cardId: H.id })
  })
})

describe('Estábulo — venda (REQ-158 b)', () => {
  it('REQ-158: Rara → ⌊50% × 280⌋ = 140, sem fator; a montaria sai', () => {
    const result = apply([{ operation: 'sellMount' }], {
      gold: 0,
      mount: emptyMount(),
    })
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(140)
    expect(result.value.player.mount).toBeNull()
    expect(result.value.result).toMatchObject({
      results: [{ operation: 'sellMount', cardId: H.id, gold: 140 }],
      goldLost: 0,
    })
  })

  it('REQ-158: o ouro acima da bolsa é perdido', () => {
    const result = apply([{ operation: 'sellMount' }], {
      gold: config.purseCapacity - 40,
      mount: emptyMount(),
    })
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    expect(result.value.player.gold).toBe(config.purseCapacity)
    expect(result.value.result.goldLost).toBe(100)
    expect(result.value.result.results[0]).toMatchObject({ gold: 140 })
  })

  it('REQ-158: sem montaria → noMount; com conteúdo → mountNotEmpty', () => {
    expect(apply([{ operation: 'sellMount' }], { gold: 0 }).value).toEqual({
      reason: 'noMount',
      operationIndex: 0,
    })
    expect(
      apply([{ operation: 'sellMount' }], {
        gold: 0,
        mount: { ...emptyMount(), tcgFolder: [{ cardId: STR.id, copies: 1 }] },
      }).value
    ).toEqual({ reason: 'mountNotEmpty', operationIndex: 0, cardId: H.id })
    expect(
      apply([{ operation: 'sellMount' }], {
        gold: 0,
        mount: {
          ...emptyMount(),
          inventory: [{ cardId: STR.id, quantity: 1 }],
        },
      }).value
    ).toMatchObject({ reason: 'mountNotEmpty' })
  })

  it('REQ-158: vender e comprar no mesmo lote (ordem do lote)', () => {
    const result = apply(
      [{ operation: 'sellMount' }, { operation: 'buyMount', cardId: H.id }],
      {
        gold: 300,
        mount: emptyMount(PONY.id),
        expansions: { ...noExpansions(), purse: 1 },
      }
    )
    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    // Comum 80 → 40 (bolsa 600); compra 322
    expect(result.value.player.gold).toBe(300 + 40 - 322)
    expect(result.value.result.results).toEqual([
      { operation: 'sellMount', cardId: PONY.id, gold: 40 },
      { operation: 'buyMount', cardId: H.id, gold: -322 },
    ])
    expect(result.value.player.mount).toEqual(emptyMount())
    expect(
      apply(
        [{ operation: 'buyMount', cardId: H.id }, { operation: 'sellMount' }],
        { gold: 400, mount: emptyMount(PONY.id) }
      ).value
    ).toMatchObject({ reason: 'mountAlreadyOwned', operationIndex: 0 })
  })
})

describe('Estábulo — projeção (REQ-158)', () => {
  const view = (
    player: Parameters<typeof makePlayerState>[0],
    zoneMounts: readonly string[]
  ) =>
    describeMarket({
      config,
      player: makePlayerState(player),
      cards,
      zoneId: ZONE,
      zoneStock: [],
      zoneMounts,
      collectionId: 'fixture',
      state: state(),
    }).stable

  it('REQ-158: ofertas com o fator e montaria atual com valor de venda', () => {
    expect(view({}, [H.id])).toEqual({
      offers: [{ cardId: H.id, price: 322 }],
      currentMount: null,
    })
    expect(view({ mount: emptyMount() }, [H.id])?.currentMount).toEqual({
      cardId: H.id,
      price: 140,
      sellable: true,
    })
    expect(
      view(
        {
          mount: {
            ...emptyMount(),
            tcgFolder: [{ cardId: STR.id, copies: 1 }],
          },
        },
        [H.id]
      )?.currentMount
    ).toMatchObject({ sellable: false })
  })

  it('REQ-158: zona sem Estábulo → stable null', () => {
    expect(view({ mount: emptyMount() }, [])).toBeNull()
  })
})
