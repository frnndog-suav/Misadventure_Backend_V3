import { type Either, left, right } from '@/core/error/either'
import type { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TItemCard,
  TRarity,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPlayerState } from '../entities/party-member'
import { addToInventory } from '../inventory'
import {
  capacitiesOf,
  departSingle,
  MARKET_EXPANSIONS,
  noExpansions,
  type TExpansions,
  type TMarketCandidate,
  type TMarketExpansion,
  type TMarketsState,
} from '../markets'
import type { TMarketOperation } from '../party-action'
import { sortedByCardId } from '../starting-player'
import { removeFromInventory } from '../vault'

/**
 * Preços e operações do Ir ao Mercado (README 24; REQ-140 a REQ-142; D-118,
 * D-119). Tudo em inteiros: preço base, `priceMultiplier` em centésimos, fator
 * e escassez em pontos percentuais; só arredonda no fim (para cima na compra,
 * para baixo na venda, com mínimo 1 na venda).
 */

type TCards = ReadonlyMap<string, TCard>
type TRng = Pick<SeededRng, 'nextInt'>
type TSellable = Extract<TCard, { type: 'attribute' | 'equipment' | 'item' }>

/** `priceMultiplier` tem até 2 casas (REQ-136): vira centésimos inteiros (D-114). */
export const multiplierCents = (multiplier: number): number =>
  Math.round(multiplier * 100)

function rarityValue(
  rarity: TRarity,
  values: Readonly<Record<TRarity, number>>
): number {
  return values[rarity]
}

const singleBasePrice = (config: TGameConfigValues, rarity: TRarity) =>
  rarityValue(rarity, {
    common: config.singlesPriceCommon,
    uncommon: config.singlesPriceUncommon,
    rare: config.singlesPriceRare,
    epic: config.singlesPriceEpic,
    legendary: config.singlesPriceLegendary,
  })

const treasureValue = (config: TGameConfigValues, rarity: TRarity) =>
  rarityValue(rarity, {
    common: config.treasureValueCommon,
    uncommon: config.treasureValueUncommon,
    rare: config.treasureValueRare,
    epic: config.treasureValueEpic,
    legendary: config.treasureValueLegendary,
  })

/** Estoque (REQ-141 a): ⌈`stockPrice` × fator⌉ por compra. */
export const stockPurchasePrice = (
  stockPrice: number,
  factorPercent: number
): number => Math.ceil((stockPrice * factorPercent) / 100)

/** Single (REQ-141 c): ⌈base × `priceMultiplier` × fator × (1 + passo × saídas)⌉. */
export function singlePrice(
  config: TGameConfigValues,
  card: Extract<TCard, { type: 'attribute' | 'equipment' | 'item' }>,
  factorPercent: number,
  departed: number
): number {
  const scarcity = 100 + config.scarcityStepPercent * departed
  return Math.ceil(
    (singleBasePrice(config, card.rarity) *
      multiplierCents(card.priceMultiplier) *
      factorPercent *
      scarcity) /
      1_000_000
  )
}

/**
 * Venda (REQ-142): ouro por lote e tamanho do lote, ou `null` se a carta não é
 * vendável. Carta de estoque: ⌊50% × `stockPrice`⌋ por `stockQuantity` cópias;
 * tesouro: valor da raridade; booster: `boosterSalePrice`; demais:
 * ⌊50% × base × `priceMultiplier`⌋. Mínimo 1 por lote.
 */
export function sellValue(
  config: TGameConfigValues,
  card: TCard
): { price: number; lotSize: number } | null {
  switch (card.type) {
    case 'item':
      if (card.stockPrice !== null) {
        return {
          price: Math.max(1, Math.floor(card.stockPrice / 2)),
          lotSize: card.stockQuantity,
        }
      }
      if (card.itemCategory === 'treasure') {
        return { price: treasureValue(config, card.rarity), lotSize: 1 }
      }
      if (card.itemCategory === 'booster') {
        return { price: config.boosterSalePrice, lotSize: 1 }
      }
      return { price: baseSellPrice(config, card), lotSize: 1 }
    case 'attribute':
    case 'equipment':
      return { price: baseSellPrice(config, card), lotSize: 1 }
    default:
      return null
  }
}

const baseSellPrice = (config: TGameConfigValues, card: TSellable): number =>
  Math.max(
    1,
    Math.floor(
      (singleBasePrice(config, card.rarity) *
        multiplierCents(card.priceMultiplier) *
        50) /
        10_000
    )
  )

export type TMarketService = Readonly<{
  expansion: TMarketExpansion
  price: number
  /** Capacidade depois da compra. */
  capacity: number
}>

/** Os cinco serviços, na ordem do contrato (REQ-143; D-120). */
export function servicesOf(
  config: TGameConfigValues,
  expansions: TExpansions = noExpansions()
): TMarketService[] {
  const current = capacitiesOf(config, expansions)
  return [
    {
      expansion: 'vaultSlots',
      price: config.vaultExpansionBasePrice * 2 ** expansions.vaultSlots,
      capacity: current.vaultSlots + config.vaultExpansionSlots,
    },
    {
      expansion: 'deckSlots',
      price: config.deckSlotExpansionBasePrice * 2 ** expansions.deckSlots,
      capacity: current.deckSlots + config.deckSlotExpansionSlots,
    },
    {
      expansion: 'tcgFolder',
      price: config.tcgFolderExpansionBasePrice * 2 ** expansions.tcgFolder,
      capacity: current.tcgFolder + config.tcgFolderExpansionSlots,
    },
    {
      expansion: 'purse',
      price: Math.ceil(
        (current.purse * config.purseExpansionPricePercent) / 100
      ),
      capacity: current.purse * 2,
    },
    {
      expansion: 'vaultGold',
      price: Math.ceil(
        (current.vaultGold * config.vaultGoldExpansionPricePercent) / 100
      ),
      capacity: current.vaultGold * 2,
    },
  ]
}

/** Boosters à venda: itens `booster` da coleção vigente, em ordem de id (REQ-141 b). */
export function marketBoosters(
  cards: TCards,
  collectionId: string | null
): TItemCard[] {
  if (collectionId === null) return []
  return [...cards.values()]
    .filter(
      (card): card is TItemCard =>
        card.type === 'item' &&
        card.itemCategory === 'booster' &&
        card.boosterCollectionId === collectionId
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export type TSellOffer = Readonly<{
  source: 'inventory' | 'tcgFolder'
  cardId: string
  owned: number
  lotSize: number
  price: number
}>

/**
 * O que o jogador pode vender agora (REQ-142): inventário na ordem dos slots,
 * agregado por carta, e depois a pasta de TCG. Só entra o que dá ao menos um
 * lote.
 */
export function sellOffersOf(
  config: TGameConfigValues,
  player: Pick<TPlayerState, 'inventory' | 'tcgFolder'>,
  cards: TCards
): TSellOffer[] {
  const offers: TSellOffer[] = []
  const owned = new Map<string, number>()
  for (const { cardId, quantity } of player.inventory) {
    owned.set(cardId, (owned.get(cardId) ?? 0) + quantity)
  }
  const push = (
    source: TSellOffer['source'],
    cardId: string,
    amount: number
  ) => {
    const card = cards.get(cardId)
    const value = card ? sellValue(config, card) : null
    if (value === null || amount < value.lotSize) return
    offers.push({ source, cardId, owned: amount, ...value })
  }
  for (const [cardId, amount] of owned) push('inventory', cardId, amount)
  for (const { cardId, copies } of player.tcgFolder) {
    push('tcgFolder', cardId, copies)
  }
  return offers
}

export type TMarketView = Readonly<{
  zoneId: string
  factorPercent: number
  stock: readonly {
    cardId: string
    price: number
    copiesPerPurchase: number
  }[]
  boosters: readonly { cardId: string; price: number }[]
  showcase:
    | readonly {
        slotIndex: number
        offer: {
          cardId: string
          price: number
          destination: 'inventory' | 'tcgFolder'
        } | null
      }[]
    | null
  services: readonly TMarketService[]
  sellOffers: readonly TSellOffer[]
}>

/**
 * Projeção do mercado para o membro da vez (REQ-140; D-124). Sem mercado
 * sorteado (save antigo): fator 100 e sem vitrine. Item de estoque que o
 * catálogo publicado não tem não aparece.
 */
export function describeMarket(input: {
  config: TGameConfigValues
  player: TPlayerState
  cards: TCards
  zoneId: string
  zoneStock: readonly string[]
  collectionId: string | null
  state: TMarketsState
}): TMarketView {
  const { config, player, cards, zoneId, state } = input
  const market = state.markets.find((entry) => entry.zoneId === zoneId)
  const factorPercent = market?.factorPercent ?? 100

  const stock = input.zoneStock.flatMap((cardId) => {
    const card = cards.get(cardId)
    return card?.type === 'item' && card.stockPrice !== null
      ? [
          {
            cardId,
            price: stockPurchasePrice(card.stockPrice, factorPercent),
            copiesPerPurchase: card.stockQuantity,
          },
        ]
      : []
  })
  const showcase = market?.singles
    ? market.showcase.map((cardId, slotIndex) => {
        const card = cardId === null ? undefined : cards.get(cardId)
        return {
          slotIndex,
          offer:
            card === undefined ||
            (card.type !== 'attribute' &&
              card.type !== 'equipment' &&
              card.type !== 'item')
              ? null
              : {
                  cardId: card.id,
                  price: singlePrice(
                    config,
                    card,
                    factorPercent,
                    state.pool.find((entry) => entry.cardId === card.id)
                      ?.departed ?? 0
                  ),
                  destination:
                    card.type === 'attribute'
                      ? ('tcgFolder' as const)
                      : ('inventory' as const),
                },
        }
      })
    : null

  return {
    zoneId,
    factorPercent,
    stock,
    boosters: marketBoosters(cards, input.collectionId).map(({ id }) => ({
      cardId: id,
      price: config.boosterPrice,
    })),
    showcase,
    services: servicesOf(config, player.expansions),
    sellOffers: sellOffersOf(config, player, cards),
  }
}

export type TMarketOperationResult =
  | {
      operation: 'buyStock'
      cardId: string
      quantity: number
      copiesReceived: number
      gold: number
    }
  | { operation: 'buyBooster'; cardId: string; quantity: number; gold: number }
  | {
      operation: 'buySingle'
      slotIndex: number
      cardId: string
      destination: 'inventory' | 'tcgFolder'
      gold: number
    }
  | {
      operation: 'sell'
      source: 'inventory' | 'tcgFolder'
      cardId: string
      quantity: number
      gold: number
    }
  | {
      operation: 'buyExpansion'
      expansion: TMarketExpansion
      /** Capacidade depois da compra. */
      capacity: number
      gold: number
    }

/** Resultado do `visitMarket` aceito (REQ-140). */
export type TMarketVisitResult = Readonly<{
  zoneId: string
  results: readonly TMarketOperationResult[]
  /** Ouro de vendas acima da bolsa, perdido (README 5.3). */
  goldLost: number
}>

export type TMarketRefusalReason =
  | 'notInMarketStock'
  | 'notMarketBooster'
  | 'singlesUnavailable'
  | 'showcaseSlotNotFound'
  | 'showcaseSlotEmpty'
  | 'notEnoughGold'
  | 'inventoryFull'
  | 'tcgFolderFull'
  | 'notInInventory'
  | 'notInTcgFolder'
  | 'notLotMultiple'

export type TMarketRefusal = Readonly<{
  reason: TMarketRefusalReason
  /** Índice da primeira operação que falha (a partir de 0). */
  operationIndex: number
  /** A carta que a operação cita, quando há uma. */
  cardId?: string
}>

export type TMarketOutcome = Readonly<{
  player: TPlayerState
  state: TMarketsState
  result: TMarketVisitResult
}>

const folderSize = (folder: TPlayerState['tcgFolder']): number =>
  folder.reduce((sum, { copies }) => sum + copies, 0)

/**
 * Aplica as operações em ordem (REQ-140 a REQ-142; D-118), cada uma sobre o
 * resultado da anterior. Devolve o novo estado ou a primeira recusa; o RNG só
 * é usado pela compra de single (reposição do slot) e quem chama descarta o
 * estado dele numa recusa. O ouro que passa da bolsa é perdido a cada venda.
 */
export function applyMarketOperations(input: {
  player: TPlayerState
  config: TGameConfigValues
  cards: TCards
  operations: readonly TMarketOperation[]
  zoneId: string
  zoneStock: readonly string[]
  collectionId: string | null
  state: TMarketsState
  candidates: readonly TMarketCandidate[]
  rng: TRng
}): Either<TMarketRefusal, TMarketOutcome> {
  const { config, cards, operations, zoneId, candidates, rng } = input
  let { state } = input
  let { inventory, tcgFolder, gold } = input.player
  let expansions = input.player.expansions ?? noExpansions()
  const marketIndex = state.markets.findIndex(
    (entry) => entry.zoneId === zoneId
  )
  const factorPercent =
    marketIndex >= 0 ? state.markets[marketIndex].factorPercent : 100
  const boosterIds = new Set(
    marketBoosters(cards, input.collectionId).map(({ id }) => id)
  )
  const results: TMarketOperationResult[] = []
  let goldLost = 0

  for (const [operationIndex, operation] of operations.entries()) {
    const refuse = (
      reason: TMarketRefusalReason,
      cardId?: string
    ): Either<TMarketRefusal, never> =>
      left(
        cardId === undefined
          ? { reason, operationIndex }
          : { reason, operationIndex, cardId }
      )

    switch (operation.operation) {
      case 'buyStock': {
        const { cardId, quantity } = operation
        const card = cards.get(cardId)
        if (
          !input.zoneStock.includes(cardId) ||
          card?.type !== 'item' ||
          card.stockPrice === null
        ) {
          return refuse('notInMarketStock', cardId)
        }
        const total =
          stockPurchasePrice(card.stockPrice, factorPercent) * quantity
        if (gold < total) return refuse('notEnoughGold', cardId)
        const copies = card.stockQuantity * quantity
        const added = addToInventory(
          inventory,
          card,
          copies,
          config.inventoryCapacity
        )
        if (added === null) return refuse('inventoryFull', cardId)
        inventory = added
        gold -= total
        results.push({
          operation: 'buyStock',
          cardId,
          quantity,
          copiesReceived: copies,
          gold: -total,
        })
        break
      }
      case 'buyBooster': {
        const { cardId, quantity } = operation
        const card = cards.get(cardId)
        if (!boosterIds.has(cardId) || card?.type !== 'item') {
          return refuse('notMarketBooster', cardId)
        }
        const total = config.boosterPrice * quantity
        if (gold < total) return refuse('notEnoughGold', cardId)
        const added = addToInventory(
          inventory,
          card,
          quantity,
          config.inventoryCapacity
        )
        if (added === null) return refuse('inventoryFull', cardId)
        inventory = added
        gold -= total
        results.push({
          operation: 'buyBooster',
          cardId,
          quantity,
          gold: -total,
        })
        break
      }
      case 'buySingle': {
        const { slotIndex } = operation
        const market = marketIndex >= 0 ? state.markets[marketIndex] : null
        if (!market?.singles) return refuse('singlesUnavailable')
        if (slotIndex >= market.showcase.length) {
          return refuse('showcaseSlotNotFound')
        }
        const cardId = market.showcase[slotIndex]
        const card = cardId === null ? undefined : cards.get(cardId)
        if (
          cardId === null ||
          (card?.type !== 'attribute' &&
            card?.type !== 'equipment' &&
            card?.type !== 'item')
        ) {
          return refuse('showcaseSlotEmpty')
        }
        const price = singlePrice(
          config,
          card,
          factorPercent,
          state.pool.find((entry) => entry.cardId === cardId)?.departed ?? 0
        )
        if (gold < price) return refuse('notEnoughGold', cardId)
        if (card.type === 'attribute') {
          if (
            folderSize(tcgFolder) + 1 >
            capacitiesOf(config, expansions).tcgFolder
          ) {
            return refuse('tcgFolderFull', cardId)
          }
          const existing = tcgFolder.find((entry) => entry.cardId === cardId)
          tcgFolder = sortedByCardId([
            ...tcgFolder.filter((entry) => entry.cardId !== cardId),
            { cardId, copies: (existing?.copies ?? 0) + 1 },
          ])
        } else {
          const added = addToInventory(
            inventory,
            card,
            1,
            config.inventoryCapacity
          )
          if (added === null) return refuse('inventoryFull', cardId)
          inventory = added
        }
        gold -= price
        state = departSingle(
          state,
          marketIndex,
          slotIndex,
          candidates,
          config,
          rng
        )
        results.push({
          operation: 'buySingle',
          slotIndex,
          cardId,
          destination: card.type === 'attribute' ? 'tcgFolder' : 'inventory',
          gold: -price,
        })
        break
      }
      case 'sell': {
        const { source, cardId, quantity } = operation
        const notOwned =
          source === 'inventory' ? 'notInInventory' : 'notInTcgFolder'
        const owned =
          source === 'inventory'
            ? inventory
                .filter((slot) => slot.cardId === cardId)
                .reduce((sum, slot) => sum + slot.quantity, 0)
            : (tcgFolder.find((entry) => entry.cardId === cardId)?.copies ?? 0)
        const card = cards.get(cardId)
        const value = card ? sellValue(config, card) : null
        if (value === null || owned < quantity) return refuse(notOwned, cardId)
        if (quantity % value.lotSize !== 0) {
          return refuse('notLotMultiple', cardId)
        }
        const proceeds = value.price * (quantity / value.lotSize)
        if (source === 'inventory') {
          const removed = removeFromInventory(inventory, cardId, quantity)
          if (removed === null) return refuse(notOwned, cardId)
          inventory = removed
        } else {
          tcgFolder = tcgFolder.flatMap((entry) =>
            entry.cardId !== cardId
              ? [entry]
              : entry.copies > quantity
                ? [{ cardId, copies: entry.copies - quantity }]
                : []
          )
        }
        const purse = capacitiesOf(config, expansions).purse
        const received = Math.min(proceeds, Math.max(0, purse - gold))
        goldLost += proceeds - received
        gold += received
        results.push({
          operation: 'sell',
          source,
          cardId,
          quantity,
          gold: proceeds,
        })
        break
      }
      case 'buyExpansion': {
        const { expansion } = operation
        const service = servicesOf(config, expansions)[
          MARKET_EXPANSIONS.indexOf(expansion)
        ]
        if (gold < service.price) return refuse('notEnoughGold')
        gold -= service.price
        expansions = { ...expansions, [expansion]: expansions[expansion] + 1 }
        results.push({
          operation: 'buyExpansion',
          expansion,
          capacity: service.capacity,
          gold: -service.price,
        })
        break
      }
      default: {
        const _exhaustive: never = operation
        return _exhaustive
      }
    }
  }

  return right({
    player: { ...input.player, inventory, tcgFolder, gold, expansions },
    state,
    result: { zoneId, results, goldLost },
  })
}
