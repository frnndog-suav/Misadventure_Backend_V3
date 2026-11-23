import type { SeededRng } from '@/core/rng/seeded-rng'
import type {
  TCard,
  TRarity,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

/** Carta que pode entrar no pool de singles (README 24.4; REQ-138). */
export type TMarketCandidate = Readonly<{ cardId: string; rarity: TRarity }>

/** Cópias de uma carta que ainda estão num mercado (sempre maior que 0). */
export type TMarketStock = Readonly<{ cardId: string; copies: number }>

/** Estado de um mercado do mapa (REQ-138; D-116, D-117). */
export type TMarket = Readonly<{
  zoneId: string
  factorPercent: number
  singles: boolean
  /** Só em mercado com singles; na ordem em que as cópias foram distribuídas. */
  stock: readonly TMarketStock[]
  /** Um id por slot; `null` = vazio. Vazio se o mercado não tem singles. */
  showcase: readonly (string | null)[]
}>

/** Carta do pool: `departed` são as cópias já saídas, por compra ou decaimento (escassez, README 24.4). */
export type TMarketPoolEntry = Readonly<{ cardId: string; departed: number }>

export type TMarketsState = Readonly<{
  markets: readonly TMarket[]
  pool: readonly TMarketPoolEntry[]
}>

/** Só o que o sorteio usa do RNG; os testes injetam uma sequência fixa. */
type TRng = Pick<SeededRng, 'nextInt'>

type TConfig = Pick<
  TGameConfigValues,
  | 'singlesShowcaseSlots'
  | 'singlesDecayMax'
  | 'singlesPoolSize'
  | 'marketFactorMinPercent'
  | 'marketFactorMaxPercent'
  | 'singlesStockCommon'
  | 'singlesStockUncommon'
  | 'singlesStockRare'
  | 'singlesStockEpic'
  | 'singlesStockLegendary'
>

interface TDraftMarket {
  zoneId: string
  factorPercent: number
  singles: boolean
  stock: { cardId: string; copies: number }[]
  showcase: (string | null)[]
}

interface TDraft {
  markets: TDraftMarket[]
  pool: { cardId: string; departed: number }[]
}

export const emptyMarketsState: TMarketsState = { markets: [], pool: [] }

/**
 * Elegíveis para singles (README 24.4; REQ-138): atributo, equipamento e item
 * exceto tesouro e booster. `cards` já vem só da coleção vigente e publicada.
 * Ordenadas por id: o catálogo não garante ordem e o sorteio precisa ser
 * reproduzível (D-125).
 */
export function marketCandidatesOf(
  cards: readonly TCard[]
): TMarketCandidate[] {
  return cards
    .flatMap((card): TMarketCandidate[] => {
      switch (card.type) {
        case 'attribute':
        case 'equipment':
          return [{ cardId: card.id, rarity: card.rarity }]
        case 'item':
          return card.itemCategory === 'treasure' ||
            card.itemCategory === 'booster'
            ? []
            : [{ cardId: card.id, rarity: card.rarity }]
        default:
          return []
      }
    })
    .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0))
}

/** As zonas do mapa que têm mercado, na ordem do mapa (REQ-138). */
export function marketZonesOf(
  mapZoneIds: readonly string[],
  zones: readonly TZoneCard[]
): { zoneId: string; singles: boolean }[] {
  return mapZoneIds.flatMap((zoneId) => {
    const market = zones.find(({ id }) => id === zoneId)?.market
    return market ? [{ zoneId, singles: market.singles }] : []
  })
}

/**
 * Sorteio na criação do grupo (REQ-138), nesta ordem: fator de cada mercado;
 * pool; estoque global distribuído cópia a cópia; vitrines. Sem mercado no
 * mapa, não usa o RNG.
 */
export function drawMarkets(
  zones: readonly { zoneId: string; singles: boolean }[],
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): TMarketsState {
  const draft: TDraft = {
    markets: zones.map(({ zoneId, singles }) => ({
      zoneId,
      factorPercent: rng.nextInt(
        config.marketFactorMinPercent,
        config.marketFactorMaxPercent
      ),
      singles,
      stock: [],
      showcase: singles
        ? Array.from({ length: config.singlesShowcaseSlots }, () => null)
        : [],
    })),
    pool: [],
  }
  if (draft.markets.some(({ singles }) => singles))
    drawPool(draft, candidates, config, rng)
  return freeze(draft)
}

/**
 * Fim de uma rodada (REQ-139): cada mercado com singles, na ordem do mapa,
 * rola 1 D20 por slot preenchido, na ordem dos slots; o resultado é lido no
 * momento em que o slot chega (um novo pool no meio da rodada pode ter
 * preenchido slots que ainda não foram rolados; D-125).
 */
export function decayMarkets(
  state: TMarketsState,
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): TMarketsState {
  const draft = thaw(state)
  draft.markets.forEach((market, marketIndex) => {
    if (!market.singles) return
    market.showcase.forEach((_, slotIndex) => {
      if (market.showcase[slotIndex] === null) return
      if (rng.nextInt(1, 20) > config.singlesDecayMax) return
      departShowcaseCopy(draft, marketIndex, slotIndex, candidates, config, rng)
    })
  })
  return freeze(draft)
}

/**
 * Uma cópia sai da vitrine (compra do jogador, REQ-141, ou decaimento, REQ-139):
 * tira do estoque do mercado, soma 1 às saídas, repõe o slot e, se a carta
 * esgotou o estoque global, ela sai do pool; com o pool vazio, sorteia o novo.
 */
export function departSingle(
  state: TMarketsState,
  marketIndex: number,
  slotIndex: number,
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): TMarketsState {
  const draft = thaw(state)
  departShowcaseCopy(draft, marketIndex, slotIndex, candidates, config, rng)
  return freeze(draft)
}

function departShowcaseCopy(
  draft: TDraft,
  marketIndex: number,
  slotIndex: number,
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): void {
  const market = draft.markets[marketIndex]
  const cardId = market.showcase[slotIndex]
  if (cardId === null) return

  const entry = market.stock.find((stock) => stock.cardId === cardId)
  if (entry) entry.copies -= 1
  market.stock = market.stock.filter(({ copies }) => copies > 0)
  const poolEntry = draft.pool.find((item) => item.cardId === cardId)
  if (poolEntry) poolEntry.departed += 1
  market.showcase[slotIndex] = null

  if (globalStock(draft, cardId) === 0)
    draft.pool = draft.pool.filter((item) => item.cardId !== cardId)
  fillSlot(draft, market, slotIndex, rng)

  if (draft.pool.length === 0) {
    drawPool(draft, candidates, config, rng)
  }
}

function drawPool(
  draft: TDraft,
  candidates: readonly TMarketCandidate[],
  config: TConfig,
  rng: TRng
): void {
  const singlesMarkets = draft.markets.filter(({ singles }) => singles)
  if (singlesMarkets.length === 0) return

  const sampled = sample(candidates, config.singlesPoolSize, rng)
  draft.pool = sampled.map(({ cardId }) => ({ cardId, departed: 0 }))
  for (const { cardId, rarity } of sampled) {
    for (let copy = 0; copy < stockOf(config, rarity); copy++) {
      const market = singlesMarkets[rng.nextInt(0, singlesMarkets.length - 1)]
      const entry = market.stock.find((stock) => stock.cardId === cardId)
      if (entry) entry.copies += 1
      else market.stock.push({ cardId, copies: 1 })
    }
  }
  for (const market of singlesMarkets) {
    market.showcase.forEach((slot, slotIndex) => {
      if (slot === null) fillSlot(draft, market, slotIndex, rng)
    })
  }
}

/**
 * Vitrine (REQ-138; D-117): uma carta uniforme, por carta e não por cópia,
 * entre as do pool com estoque neste mercado que não estão em outro slot. Sem
 * candidata, o slot fica vazio e o RNG não avança.
 */
function fillSlot(
  draft: TDraft,
  market: TDraftMarket,
  slotIndex: number,
  rng: TRng
): void {
  const taken = new Set(market.showcase)
  const options = draft.pool.filter(
    ({ cardId }) =>
      !taken.has(cardId) && market.stock.some((item) => item.cardId === cardId)
  )
  if (options.length === 0) return
  market.showcase[slotIndex] =
    options[rng.nextInt(0, options.length - 1)].cardId
}

/** Amostra sem reposição; com poucas elegíveis entram todas, sem RNG (D-117). */
function sample(
  candidates: readonly TMarketCandidate[],
  size: number,
  rng: TRng
): TMarketCandidate[] {
  const items = [...candidates]
  if (items.length <= size) return items
  for (let i = 0; i < size; i++) {
    const j = rng.nextInt(i, items.length - 1)
    const swap = items[i]
    items[i] = items[j]
    items[j] = swap
  }
  return items.slice(0, size)
}

function globalStock(draft: TDraft, cardId: string): number {
  return draft.markets.reduce(
    (total, { stock }) =>
      total + (stock.find((item) => item.cardId === cardId)?.copies ?? 0),
    0
  )
}

function stockOf(config: TConfig, rarity: TRarity): number {
  switch (rarity) {
    case 'common':
      return config.singlesStockCommon
    case 'uncommon':
      return config.singlesStockUncommon
    case 'rare':
      return config.singlesStockRare
    case 'epic':
      return config.singlesStockEpic
    case 'legendary':
      return config.singlesStockLegendary
    default: {
      const _exhaustive: never = rarity
      return _exhaustive
    }
  }
}

function thaw(state: TMarketsState): TDraft {
  return {
    markets: state.markets.map((market) => ({
      ...market,
      stock: market.stock.map((item) => ({ ...item })),
      showcase: [...market.showcase],
    })),
    pool: state.pool.map((entry) => ({ ...entry })),
  }
}

function freeze(draft: TDraft): TMarketsState {
  return {
    markets: draft.markets.map((market) => ({
      ...market,
      stock: market.stock.map((item) => ({ ...item })),
      showcase: [...market.showcase],
    })),
    pool: draft.pool.map((entry) => ({ ...entry })),
  }
}

/** Expansões do mercado (README 6.4, 24.5; D-120). */
export const MARKET_EXPANSIONS = [
  'vaultSlots',
  'deckSlots',
  'tcgFolder',
  'purse',
  'vaultGold',
] as const
export type TMarketExpansion = (typeof MARKET_EXPANSIONS)[number]

/** Quantas vezes cada expansão foi comprada pelo jogador. */
export type TExpansions = Readonly<Record<TMarketExpansion, number>>

export const noExpansions = (): TExpansions => ({
  vaultSlots: 0,
  deckSlots: 0,
  tcgFolder: 0,
  purse: 0,
  vaultGold: 0,
})

/** Capacidades efetivas do jogador: snapshot + expansões (REQ-143; D-120). */
export type TCapacities = Readonly<Record<TMarketExpansion, number>>

export function capacitiesOf(
  config: TGameConfigValues,
  expansions: TExpansions = noExpansions()
): TCapacities {
  return {
    vaultSlots:
      config.vaultCapacity + config.vaultExpansionSlots * expansions.vaultSlots,
    deckSlots:
      config.vaultDeckSlots +
      config.deckSlotExpansionSlots * expansions.deckSlots,
    tcgFolder:
      config.tcgFolderCapacity +
      config.tcgFolderExpansionSlots * expansions.tcgFolder,
    purse: config.purseCapacity * 2 ** expansions.purse,
    vaultGold: config.vaultGoldCapacity * 2 ** expansions.vaultGold,
  }
}
