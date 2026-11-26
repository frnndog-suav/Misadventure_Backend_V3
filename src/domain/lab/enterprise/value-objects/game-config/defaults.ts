// Único lugar dos valores ajustáveis do Apêndice A (D-11) e dos seus limites (D-12).
// Cada FEAT seguinte acrescenta aqui as suas chaves.

export type TReserveDeckEntry =
  | { type: 'gold'; amount: number; weight: number }
  | { type: 'card'; cardId: string; weight: number }

import type {
  TEnemyAbilityPriority,
  TEnemyBehavior,
} from '@/domain/catalog/enterprise/value-objects/card'

const COMBAT_NUMERIC_DEFAULTS = {
  maxCombatCycles: 20,
  combatEscapeThreshold: 10,
  combatEscapePeakLoss: 2,
  exhaustionPenaltyPercent: 10,
  projectileAccuracyBonusPercent: 10,
  areaDamagePercent: 50,
  shieldProjectileDamagePercent: 50,
  channelInterruptDamagePercent: 20,
  elementAdvantageBonusPercent: 25,
  elementDisadvantagePenaltyPercent: 25,
}

export const COMBAT_NUMERIC_LIMITS = {
  maxCombatCycles: { min: 1, max: 100 },
  combatEscapeThreshold: { min: 0, max: 20 },
  combatEscapePeakLoss: { min: 0, max: 1000 },
  exhaustionPenaltyPercent: { min: 0, max: 100 },
  projectileAccuracyBonusPercent: { min: 0, max: 100 },
  areaDamagePercent: { min: 0, max: 100 },
  shieldProjectileDamagePercent: { min: 0, max: 100 },
  channelInterruptDamagePercent: { min: 0, max: 100 },
  elementAdvantageBonusPercent: { min: 0, max: 100 },
  elementDisadvantagePenaltyPercent: { min: 0, max: 100 },
}

export type TEnemyAbilityPriorities = Readonly<
  Record<TEnemyBehavior, readonly TEnemyAbilityPriority[]>
>

const QUEST_DEFAULTS = {
  zoneQuestPeakGain: 3,
  genericQuestPeakGain: 5,
  questBoardSize: 3,
  maxOpenQuests: 3,
  trialMinPeak: 30,
  mentorBaseGoldCost: 150,
  trialRandomEventTarget: 3,
  trialCombatTarget: 3,
  mentorRandomEventTarget: 5,
  mentorCombatTarget: 5,
  lockSpecializationAdditional: 6,
  lockSpecializationReinforcement: 4,
}

export const QUEST_LIMITS = {
  zoneQuestPeakGain: { min: 0, max: 1000 },
  genericQuestPeakGain: { min: 0, max: 1000 },
  questBoardSize: { min: 1, max: 50 },
  maxOpenQuests: { min: 1, max: 50 },
  trialMinPeak: { min: 0, max: 1000 },
  mentorBaseGoldCost: { min: 0, max: 1000000 },
  trialRandomEventTarget: { min: 0, max: 1000 },
  trialCombatTarget: { min: 0, max: 1000 },
  mentorRandomEventTarget: { min: 0, max: 1000 },
  mentorCombatTarget: { min: 0, max: 1000 },
  lockSpecializationAdditional: { min: 0, max: 200 },
  lockSpecializationReinforcement: { min: 0, max: 200 },
} satisfies Record<keyof typeof QUEST_DEFAULTS, { min: number; max: number }>

/** REQ-137 (CONTRATO FEAT-16): mercado, vitrine, tesouros, boosters e expansões. */
export const MARKET_DEFAULTS = {
  singlesShowcaseSlots: 4,
  singlesDecayMax: 3,
  singlesPoolSize: 20,
  marketFactorMinPercent: 80,
  marketFactorMaxPercent: 120,
  singlesStockCommon: 6,
  singlesStockUncommon: 4,
  singlesStockRare: 2,
  singlesStockEpic: 1,
  singlesStockLegendary: 1,
  singlesPriceCommon: 5,
  singlesPriceUncommon: 15,
  singlesPriceRare: 45,
  singlesPriceEpic: 130,
  singlesPriceLegendary: 370,
  scarcityStepPercent: 10,
  treasureValueCommon: 10,
  treasureValueUncommon: 25,
  treasureValueRare: 60,
  treasureValueEpic: 150,
  treasureValueLegendary: 400,
  boosterPrice: 30,
  boosterCardCount: 8,
  boosterSalePrice: 15,
  boosterChanceCommon: 600,
  boosterChanceUncommon: 250,
  boosterChanceRare: 110,
  boosterChanceEpic: 35,
  boosterChanceLegendary: 5,
  vaultExpansionSlots: 5,
  vaultExpansionBasePrice: 50,
  deckSlotExpansionSlots: 1,
  deckSlotExpansionBasePrice: 100,
  tcgFolderExpansionSlots: 10,
  tcgFolderExpansionBasePrice: 60,
  purseExpansionPricePercent: 50,
  vaultGoldExpansionPricePercent: 25,
}

export const MARKET_LIMITS = {
  singlesShowcaseSlots: { min: 1, max: 20 },
  singlesDecayMax: { min: 0, max: 20 },
  singlesPoolSize: { min: 1, max: 1000 },
  marketFactorMinPercent: { min: 1, max: 1000 },
  marketFactorMaxPercent: { min: 1, max: 1000 },
  singlesStockCommon: { min: 1, max: 100 },
  singlesStockUncommon: { min: 1, max: 100 },
  singlesStockRare: { min: 1, max: 100 },
  singlesStockEpic: { min: 1, max: 100 },
  singlesStockLegendary: { min: 1, max: 100 },
  singlesPriceCommon: { min: 1, max: 1000000 },
  singlesPriceUncommon: { min: 1, max: 1000000 },
  singlesPriceRare: { min: 1, max: 1000000 },
  singlesPriceEpic: { min: 1, max: 1000000 },
  singlesPriceLegendary: { min: 1, max: 1000000 },
  scarcityStepPercent: { min: 0, max: 1000 },
  treasureValueCommon: { min: 1, max: 1000000 },
  treasureValueUncommon: { min: 1, max: 1000000 },
  treasureValueRare: { min: 1, max: 1000000 },
  treasureValueEpic: { min: 1, max: 1000000 },
  treasureValueLegendary: { min: 1, max: 1000000 },
  boosterPrice: { min: 0, max: 1000000 },
  boosterCardCount: { min: 1, max: 50 },
  boosterSalePrice: { min: 1, max: 1000000 },
  boosterChanceCommon: { min: 0, max: 1000 },
  boosterChanceUncommon: { min: 0, max: 1000 },
  boosterChanceRare: { min: 0, max: 1000 },
  boosterChanceEpic: { min: 0, max: 1000 },
  boosterChanceLegendary: { min: 0, max: 1000 },
  vaultExpansionSlots: { min: 1, max: 1000 },
  vaultExpansionBasePrice: { min: 0, max: 1000000 },
  deckSlotExpansionSlots: { min: 1, max: 100 },
  deckSlotExpansionBasePrice: { min: 0, max: 1000000 },
  tcgFolderExpansionSlots: { min: 1, max: 1000 },
  tcgFolderExpansionBasePrice: { min: 0, max: 1000000 },
  purseExpansionPricePercent: { min: 0, max: 1000 },
  vaultGoldExpansionPricePercent: { min: 0, max: 1000 },
} satisfies Record<keyof typeof MARKET_DEFAULTS, { min: number; max: number }>

/** REQ-146 (CONTRATO FEAT-17): consertar, refinar, encantar, venda e Artífice. */
export const BLACKSMITH_DEFAULTS = {
  repairBaseGold: 5,
  repairGoldPerLevel: 2,
  repairMarkPercent: 12,
  refineGoldPerLevel: 10,
  refineThreshold1to3: 0,
  refineThreshold4to6: 8,
  refineThreshold7to9: 12,
  refineThreshold10: 16,
  refineBreakFromLevel: 7,
  refineBonusPercent: 5,
  enchantElementGold: 50,
  enchantEffectGold: 100,
  enchantElementThreshold: 10,
  enchantEffectThreshold: 13,
  saleRefinePercent: 8,
  saleEnchantPercent: 20,
  artificerRepairDiscountPercent: 50,
  artificerMaxRefineLevel: 6,
  artificerD20Bonus: 2,
}

export const BLACKSMITH_LIMITS = {
  repairBaseGold: { min: 0, max: 1000000 },
  repairGoldPerLevel: { min: 0, max: 1000000 },
  repairMarkPercent: { min: 0, max: 100 },
  refineGoldPerLevel: { min: 0, max: 1000000 },
  refineThreshold1to3: { min: 0, max: 21 },
  refineThreshold4to6: { min: 0, max: 21 },
  refineThreshold7to9: { min: 0, max: 21 },
  refineThreshold10: { min: 0, max: 21 },
  refineBreakFromLevel: { min: 1, max: 11 },
  refineBonusPercent: { min: 0, max: 1000 },
  enchantElementGold: { min: 0, max: 1000000 },
  enchantEffectGold: { min: 0, max: 1000000 },
  enchantElementThreshold: { min: 0, max: 21 },
  enchantEffectThreshold: { min: 0, max: 21 },
  saleRefinePercent: { min: 0, max: 1000 },
  saleEnchantPercent: { min: 0, max: 1000 },
  artificerRepairDiscountPercent: { min: 0, max: 100 },
  artificerMaxRefineLevel: { min: 0, max: 10 },
  artificerD20Bonus: { min: 0, max: 20 },
} satisfies Record<
  keyof typeof BLACKSMITH_DEFAULTS,
  { min: number; max: number }
>

/** REQ-156 (CONTRATO FEAT-18): preço base por raridade e espaços da montaria. */
export const COMPLETION_PEAK_DEFAULTS = {
  dimensionCompletionPeakGain: 25,
  bossPeakGain: 15,
} as const

export const COMPLETION_PEAK_LIMITS = {
  dimensionCompletionPeakGain: { min: 0, max: 1000 },
  bossPeakGain: { min: 0, max: 1000 },
} satisfies Record<
  keyof typeof COMPLETION_PEAK_DEFAULTS,
  { min: number; max: number }
>

export const MOUNT_DEFAULTS = {
  mountPriceCommon: 80,
  mountPriceUncommon: 150,
  mountPriceRare: 280,
  mountPriceEpic: 550,
  mountPriceLegendary: 1100,
  mountInventorySlots: 4,
  mountFolderCapacity: 10,
}

export const MOUNT_LIMITS = {
  mountPriceCommon: { min: 0, max: 1000000 },
  mountPriceUncommon: { min: 0, max: 1000000 },
  mountPriceRare: { min: 0, max: 1000000 },
  mountPriceEpic: { min: 0, max: 1000000 },
  mountPriceLegendary: { min: 0, max: 1000000 },
  mountInventorySlots: { min: 0, max: 100 },
  mountFolderCapacity: { min: 0, max: 1000 },
} satisfies Record<keyof typeof MOUNT_DEFAULTS, { min: number; max: number }>

export interface TGameConfigValues extends Record<
  | keyof typeof COMBAT_NUMERIC_DEFAULTS
  | keyof typeof QUEST_DEFAULTS
  | keyof typeof MARKET_DEFAULTS
  | keyof typeof BLACKSMITH_DEFAULTS
  | keyof typeof MOUNT_DEFAULTS
  | keyof typeof COMPLETION_PEAK_DEFAULTS,
  number
> {
  enemyAbilityPriorities: TEnemyAbilityPriorities
  escapeVigorPercent: number
  reserveDeck: readonly Readonly<TReserveDeckEntry>[]
  minPlayers: number // README 1.3
  maxPlayers: number // README 1.3
  actionPointsPerTurn: number // README 11.1
  initialPeak: number // README 7.4
  initialVigor: number // README 7.4
  baseHealth: number // README 9.1
  initialGold: number // README 9.1
  initialHandSize: number // README 9.1
  minDeckSize: number // README 4.4
  lockOneEssential: number // README 8.2
  lockTwoEssentials: number // README 8.2
  mapMaxAttempts: number // README 3.5 (D-38)
  defaultAttack: number // README 8.7 (Padrão)
  defaultDefense: number // README 8.7
  defaultAccuracy: number // README 8.7
  defaultEvasion: number // README 8.7
  defaultCelerity: number // README 8.7
  defaultPiercing: number // README 8.7
  defaultReflection: number // README 8.7
  maxCopiesPerCard: number // README 4.3 (D-67)
  tcgFolderCapacity: number // README 6.3
  recoverHealthPercent: number // README 12.5
  knockoutHealthPercent: number
  knockoutPeakLossPercent: number
  knockoutVigorCapPercent: number
  soloKnockoutGoldLossPercent: number
  soloKnockoutWaitRounds: number
  recoverVigorPercent: number // README 7.3 item 6
  recoverHandSize: number // README 12.5
  inventoryCapacity: number // README 6.2 (D-73)
  purseCapacity: number // README 5.3 (D-73)
  vaultCapacity: number // README 6.4 (D-89)
  vaultDeckSlots: number // README 6.4 (D-89)
  vaultGoldCapacity: number // README 6.4 (D-89)
}

export type TGameConfigKey = keyof TGameConfigValues

export type TNumericGameConfigKey = Exclude<
  TGameConfigKey,
  'reserveDeck' | 'enemyAbilityPriorities'
>

export interface TGameConfigLimit {
  min: number
  max: number
}

export const GAME_CONFIG_DEFAULTS: Readonly<TGameConfigValues> = Object.freeze({
  ...QUEST_DEFAULTS,
  ...MARKET_DEFAULTS,
  ...BLACKSMITH_DEFAULTS,
  ...MOUNT_DEFAULTS,
  ...COMPLETION_PEAK_DEFAULTS,
  ...COMBAT_NUMERIC_DEFAULTS,
  enemyAbilityPriorities: {
    aggressive: ['highestPower'],
    defensive: ['selfBuffOrContinuous', 'highestPower'],
    support: ['supportWoundedAlly', 'highestPower'],
    hunter: ['highestPower'],
  } as const,
  escapeVigorPercent: 20,
  reserveDeck: Object.freeze([
    Object.freeze({ type: 'gold' as const, amount: 1, weight: 1 }),
  ]),
  minPlayers: 1,
  maxPlayers: 6,
  actionPointsPerTurn: 3,
  initialPeak: 10,
  initialVigor: 10,
  baseHealth: 20,
  initialGold: 10,
  initialHandSize: 7,
  minDeckSize: 60,
  lockOneEssential: 18,
  lockTwoEssentials: 10,
  mapMaxAttempts: 1000,
  defaultAttack: 5,
  defaultDefense: 3,
  defaultAccuracy: 50,
  defaultEvasion: 20,
  defaultCelerity: 10,
  defaultPiercing: 0,
  defaultReflection: 0,
  maxCopiesPerCard: 4,
  tcgFolderCapacity: 30,
  recoverHealthPercent: 15,
  knockoutHealthPercent: 10,
  knockoutPeakLossPercent: 10,
  knockoutVigorCapPercent: 50,
  soloKnockoutGoldLossPercent: 10,
  soloKnockoutWaitRounds: 1,
  recoverVigorPercent: 5,
  recoverHandSize: 7,
  inventoryCapacity: 10,
  purseCapacity: 300,
  vaultCapacity: 30,
  vaultDeckSlots: 10,
  vaultGoldCapacity: 2000,
})

/** Inteiros, inclusivos. Além deles, `minPlayers ≤ maxPlayers`. */
export const KNOCKOUT_NUMERIC_LIMITS = {
  knockoutHealthPercent: { min: 1, max: 100 },
  knockoutPeakLossPercent: { min: 0, max: 100 },
  knockoutVigorCapPercent: { min: 0, max: 100 },
  soloKnockoutGoldLossPercent: { min: 0, max: 100 },
  soloKnockoutWaitRounds: { min: 0, max: 10 },
} as const

export const GAME_CONFIG_LIMITS: Readonly<
  Record<TNumericGameConfigKey, Readonly<TGameConfigLimit>> & {
    reserveDeck: Readonly<{ minEntries: number; minWeight: number }>
    enemyAbilityPriorities: Readonly<{ minEntries: number }>
  }
> = Object.freeze({
  ...COMBAT_NUMERIC_LIMITS,
  enemyAbilityPriorities: { minEntries: 1 },
  escapeVigorPercent: { min: 0, max: 100 },
  reserveDeck: { minEntries: 1, minWeight: 1 },
  minPlayers: { min: 1, max: 6 },
  maxPlayers: { min: 1, max: 6 },
  actionPointsPerTurn: { min: 1, max: 10 },
  initialPeak: { min: 1, max: 1000 },
  initialVigor: { min: 0, max: 1000 },
  baseHealth: { min: 1, max: 1000 },
  initialGold: { min: 0, max: 100000 },
  initialHandSize: { min: 0, max: 60 },
  minDeckSize: { min: 1, max: 200 },
  lockOneEssential: { min: 0, max: 200 },
  lockTwoEssentials: { min: 0, max: 200 },
  mapMaxAttempts: { min: 1, max: 100000 },
  defaultAttack: { min: 0, max: 1000 },
  defaultDefense: { min: 0, max: 1000 },
  defaultAccuracy: { min: 0, max: 1000 },
  defaultEvasion: { min: 0, max: 1000 },
  defaultCelerity: { min: 0, max: 1000 },
  defaultPiercing: { min: 0, max: 1000 },
  defaultReflection: { min: 0, max: 1000 },
  maxCopiesPerCard: { min: 1, max: 200 },
  tcgFolderCapacity: { min: 0, max: 1000 },
  recoverHealthPercent: { min: 0, max: 100 },
  ...KNOCKOUT_NUMERIC_LIMITS,
  ...QUEST_LIMITS,
  ...MARKET_LIMITS,
  ...BLACKSMITH_LIMITS,
  ...MOUNT_LIMITS,
  ...COMPLETION_PEAK_LIMITS,
  recoverVigorPercent: { min: 0, max: 100 },
  recoverHandSize: { min: 0, max: 200 },
  inventoryCapacity: { min: 0, max: 100 },
  purseCapacity: { min: 0, max: 1000000 },
  vaultCapacity: { min: 0, max: 1000 },
  vaultDeckSlots: { min: 1, max: 100 },
  vaultGoldCapacity: { min: 0, max: 10000000 },
})
