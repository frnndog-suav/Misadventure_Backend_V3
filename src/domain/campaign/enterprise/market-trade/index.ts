import { type Either, left, right } from '@/core/error/either'
import type { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TEquipmentCard,
  TItemCard,
  TRarity,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import type { TPlayerState } from '../entities/party-member'
import {
  activeEnchantments,
  DEFAULT_EQUIPMENT_STATE,
  type TEquipmentState,
} from '../equipment-state'
import {
  receiveAttribute,
  receiveCapacitiesOf,
  receiveCard,
  receiveResource,
  type TMountState,
  type TReceivedPart,
  type TReceiveSpace,
} from '../mount'
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
import { pickFromSlots } from '../vault'

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

const mountBasePrice = (config: TGameConfigValues, rarity: TRarity) =>
  rarityValue(rarity, {
    common: config.mountPriceCommon,
    uncommon: config.mountPriceUncommon,
    rare: config.mountPriceRare,
    epic: config.mountPriceEpic,
    legendary: config.mountPriceLegendary,
  })

/** Estábulo (REQ-158 a): ⌈preço base da raridade × fator⌉. */
export const mountPurchasePrice = (
  config: TGameConfigValues,
  rarity: TRarity,
  factorPercent: number
): number => Math.ceil((mountBasePrice(config, rarity) * factorPercent) / 100)

/** Estábulo (REQ-158 b): ⌊50% × preço base⌋, sem fator. */
export const mountSellPrice = (
  config: TGameConfigValues,
  rarity: TRarity
): number => Math.floor(mountBasePrice(config, rarity) / 2)

const mountIsEmpty = (mount: TMountState): boolean =>
  mount.inventory.length === 0 && mount.tcgFolder.length === 0

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
 * ⌊50% × base × `priceMultiplier`⌋. Mínimo 1 por lote. Equipamento: com o
 * estado da cópia (REQ-154; ausente = padrão).
 */
export function sellValue(
  config: TGameConfigValues,
  card: TCard,
  equipmentState: TEquipmentState = DEFAULT_EQUIPMENT_STATE
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
      return { price: baseSellPrice(config, card), lotSize: 1 }
    case 'equipment':
      return {
        price: equipmentSellPrice(config, card, equipmentState),
        lotSize: 1,
      }
    default:
      return null
  }
}

/**
 * REQ-154: quebrado → 0; senão ⌊50% × base × `priceMultiplier` × (1 + refino ×
 * `saleRefinePercent` + encantamentos ligados × `saleEnchantPercent`) ×
 * max(0, 1 − marcas × `repairMarkPercent`)⌋, com mínimo 1 só se o fator de
 * reparo for > 0. Tudo em inteiros (percentuais e centésimos).
 */
function equipmentSellPrice(
  config: TGameConfigValues,
  card: TEquipmentCard,
  state: TEquipmentState
): number {
  if (state.broken) return 0
  const repair = Math.max(0, 100 - config.repairMarkPercent * state.repairMarks)
  if (repair === 0) return 0
  const growth =
    100 +
    config.saleRefinePercent * state.refinement +
    config.saleEnchantPercent * activeEnchantments(card, state).length
  return Math.max(
    1,
    Math.floor(
      (singleBasePrice(config, card.rarity) *
        multiplierCents(card.priceMultiplier) *
        50 *
        growth *
        repair) /
        100_000_000
    )
  )
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
  /** REQ-154: só em equipamento do inventário (uma oferta por cópia). */
  inventorySlotIndex?: number
  equipmentState?: TEquipmentState
}>

/**
 * O que o jogador pode vender agora (REQ-142, REQ-154): inventário na ordem
 * dos slots, agregado por carta (equipamento: uma oferta por cópia, com o
 * índice do slot, o estado e o preço dela), e depois a pasta de TCG. Só entra
 * o que dá ao menos um lote.
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
  const listed = new Set<string>()
  for (const [index, slot] of player.inventory.entries()) {
    const card = cards.get(slot.cardId)
    if (card?.type === 'equipment') {
      const equipmentState = slot.equipmentState ?? DEFAULT_EQUIPMENT_STATE
      offers.push({
        source: 'inventory',
        cardId: slot.cardId,
        owned: 1,
        lotSize: 1,
        price: equipmentSellPrice(config, card, equipmentState),
        inventorySlotIndex: index,
        equipmentState,
      })
    } else if (!listed.has(slot.cardId)) {
      listed.add(slot.cardId)
      push('inventory', slot.cardId, owned.get(slot.cardId) ?? 0)
    }
  }
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
          destination: TReceiveSpace
        } | null
      }[]
    | null
  services: readonly TMarketService[]
  sellOffers: readonly TSellOffer[]
  /** REQ-158: só em zona com Estábulo; senão `null`. */
  stable: Readonly<{
    offers: readonly { cardId: string; price: number }[]
    currentMount: { cardId: string; price: number; sellable: boolean } | null
  }> | null
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
  /** REQ-158: `market.mounts` da zona (vazio = sem Estábulo). */
  zoneMounts?: readonly string[]
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
                  // REQ-159: onde a cópia entraria agora (não cabe → o principal).
                  destination:
                    receiveCard(
                      player,
                      card,
                      1,
                      receiveCapacitiesOf(config, player.expansions)
                    )?.received[0].space ??
                    (card.type === 'attribute' ? 'tcgFolder' : 'inventory'),
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
    stable: describeStable(
      config,
      player,
      cards,
      input.zoneMounts ?? [],
      factorPercent
    ),
  }
}

/** REQ-158: ofertas na ordem de `market.mounts` (id que o catálogo não tem como `mount` fica de fora). */
function describeStable(
  config: TGameConfigValues,
  player: TPlayerState,
  cards: TCards,
  zoneMounts: readonly string[],
  factorPercent: number
): TMarketView['stable'] {
  if (zoneMounts.length === 0) return null
  const offers = zoneMounts.flatMap((cardId) => {
    const card = cards.get(cardId)
    return card?.type === 'mount'
      ? [
          {
            cardId,
            price: mountPurchasePrice(config, card.rarity, factorPercent),
          },
        ]
      : []
  })
  const mount = player.mount ?? null
  const card = mount === null ? undefined : cards.get(mount.cardId)
  return {
    offers,
    currentMount:
      mount !== null && card?.type === 'mount'
        ? {
            cardId: mount.cardId,
            price: mountSellPrice(config, card.rarity),
            sellable: mountIsEmpty(mount),
          }
        : null,
  }
}

export type TMarketOperationResult =
  | {
      operation: 'buyStock'
      cardId: string
      quantity: number
      copiesReceived: number
      /** REQ-159: quanto entrou em cada espaço; ausente nos saves de antes da T-77 (D-152). */
      received?: readonly TReceivedPart<'inventory' | 'mountInventory'>[]
      gold: number
    }
  | {
      operation: 'buyBooster'
      cardId: string
      quantity: number
      /** REQ-159: quanto entrou em cada espaço; ausente nos saves de antes da T-77 (D-152). */
      received?: readonly TReceivedPart<'inventory' | 'mountInventory'>[]
      gold: number
    }
  | {
      operation: 'buySingle'
      slotIndex: number
      cardId: string
      destination: TReceiveSpace
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
  | { operation: 'buyMount'; cardId: string; gold: number }
  | { operation: 'sellMount'; cardId: string; gold: number }

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
  | 'mountNotOffered'
  | 'mountAlreadyOwned'
  | 'noMount'
  | 'mountNotEmpty'

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
  /** REQ-158: `market.mounts` da zona (vazio = sem Estábulo). */
  zoneMounts?: readonly string[]
  collectionId: string | null
  state: TMarketsState
  candidates: readonly TMarketCandidate[]
  rng: TRng
}): Either<TMarketRefusal, TMarketOutcome> {
  const { config, cards, operations, zoneId, candidates, rng } = input
  let { state } = input
  let { inventory, tcgFolder, gold } = input.player
  let expansions = input.player.expansions ?? noExpansions()
  let mount = input.player.mount ?? null
  const zoneMounts = input.zoneMounts ?? []
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
  /** D-141: índice de cada slot no inventário de antes do lote (`null` = entrou no lote). */
  let origins: (number | null)[] = inventory.map((_, index) => index)
  /** Compras só acrescentam slots no fim ou empilham num existente (`addToInventory`); nunca inserem no meio. */
  const grow = (next: TPlayerState['inventory']) => {
    origins = [
      ...origins,
      ...Array.from(
        { length: next.length - inventory.length },
        (): number | null => null
      ),
    ]
    inventory = next
  }
  /** REQ-159: chegada de recurso com transbordo para o inventário extra. */
  const receiveItems = (
    card: Parameters<typeof receiveResource>[0]['card'],
    quantity: number
  ) => {
    const out = receiveResource({
      inventory,
      mount,
      card,
      quantity,
      capacities: {
        inventory: config.inventoryCapacity,
        mountInventory: config.mountInventorySlots,
      },
    })
    if (out === null) return null
    grow(out.inventory)
    mount = out.mount
    return out.received
  }

  /** Venda: o ouro acima da bolsa é perdido (REQ-142, REQ-158). */
  const receive = (proceeds: number) => {
    const purse = capacitiesOf(config, expansions).purse
    const received = Math.min(proceeds, Math.max(0, purse - gold))
    goldLost += proceeds - received
    gold += received
  }
  const credit = (
    proceeds: number,
    source: 'inventory' | 'tcgFolder',
    cardId: string,
    quantity: number
  ) => {
    receive(proceeds)
    results.push({
      operation: 'sell',
      source,
      cardId,
      quantity,
      gold: proceeds,
    })
  }

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
        const added = receiveItems(card, copies)
        if (added === null) return refuse('inventoryFull', cardId)
        gold -= total
        results.push({
          operation: 'buyStock',
          cardId,
          quantity,
          copiesReceived: copies,
          received: added,
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
        const added = receiveItems(card, quantity)
        if (added === null) return refuse('inventoryFull', cardId)
        gold -= total
        results.push({
          operation: 'buyBooster',
          cardId,
          quantity,
          received: added,
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
        let destination: TReceiveSpace
        if (card.type === 'attribute') {
          // REQ-159: a pasta e, cheia, a pasta extra.
          const added = receiveAttribute({
            tcgFolder,
            mount,
            cardId,
            quantity: 1,
            capacities: {
              tcgFolder: capacitiesOf(config, expansions).tcgFolder,
              mountTcgFolder: config.mountFolderCapacity,
            },
          })
          if (added === null) return refuse('tcgFolderFull', cardId)
          tcgFolder = added.tcgFolder
          mount = added.mount
          destination = added.received[0].space
        } else {
          const added = receiveItems(card, 1)
          if (added === null) return refuse('inventoryFull', cardId)
          destination = added[0].space
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
          destination,
          gold: -price,
        })
        break
      }
      case 'sell': {
        const { source, cardId, quantity, inventorySlotIndex } = operation
        const notOwned =
          source === 'inventory' ? 'notInInventory' : 'notInTcgFolder'
        if (inventorySlotIndex !== undefined) {
          const current = origins.indexOf(inventorySlotIndex)
          const card = cards.get(cardId)
          const slot = inventory[current]
          if (
            source !== 'inventory' ||
            quantity !== 1 ||
            current < 0 ||
            slot.cardId !== cardId ||
            card?.type !== 'equipment'
          ) {
            return refuse('notInInventory', cardId)
          }
          const proceeds = equipmentSellPrice(
            config,
            card,
            slot.equipmentState ?? DEFAULT_EQUIPMENT_STATE
          )
          inventory = inventory.filter((_, index) => index !== current)
          origins = origins.filter((_, index) => index !== current)
          credit(proceeds, source, cardId, quantity)
          break
        }
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
        let proceeds = value.price * (quantity / value.lotSize)
        if (source === 'inventory') {
          const picked = pickFromSlots(inventory, cardId, quantity)
          if (picked === null) return refuse(notOwned, cardId)
          if (card?.type === 'equipment') {
            proceeds = picked.picked.reduce(
              (sum, slot) =>
                sum +
                slot.quantity *
                  equipmentSellPrice(
                    config,
                    card,
                    slot.equipmentState ?? DEFAULT_EQUIPMENT_STATE
                  ),
              0
            )
          }
          origins = origins.filter(
            (_, index) =>
              inventory[index].quantity > (picked.taken.get(index) ?? 0)
          )
          inventory = picked.rest
        } else {
          tcgFolder = tcgFolder.flatMap((entry) =>
            entry.cardId !== cardId
              ? [entry]
              : entry.copies > quantity
                ? [{ cardId, copies: entry.copies - quantity }]
                : []
          )
        }
        credit(proceeds, source, cardId, quantity)
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
      case 'buyMount': {
        const { cardId } = operation
        const card = cards.get(cardId)
        if (!zoneMounts.includes(cardId) || card?.type !== 'mount') {
          return refuse('mountNotOffered', cardId)
        }
        if (mount !== null) return refuse('mountAlreadyOwned', cardId)
        const price = mountPurchasePrice(config, card.rarity, factorPercent)
        if (gold < price) return refuse('notEnoughGold', cardId)
        gold -= price
        mount = { cardId, inventory: [], tcgFolder: [] }
        results.push({ operation: 'buyMount', cardId, gold: -price })
        break
      }
      case 'sellMount': {
        if (mount === null) return refuse('noMount')
        if (!mountIsEmpty(mount)) return refuse('mountNotEmpty', mount.cardId)
        const card = cards.get(mount.cardId)
        const proceeds =
          card?.type === 'mount' ? mountSellPrice(config, card.rarity) : 0
        receive(proceeds)
        results.push({
          operation: 'sellMount',
          cardId: mount.cardId,
          gold: proceeds,
        })
        mount = null
        break
      }
      default: {
        const _exhaustive: never = operation
        return _exhaustive
      }
    }
  }

  return right({
    player: {
      ...input.player,
      inventory,
      tcgFolder,
      gold,
      expansions,
      mount,
    },
    state,
    result: { zoneId, results, goldLost },
  })
}
