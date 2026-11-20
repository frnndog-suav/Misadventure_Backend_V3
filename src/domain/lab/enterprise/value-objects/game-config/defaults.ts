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

export interface TGameConfigValues extends Record<
  keyof typeof COMBAT_NUMERIC_DEFAULTS,
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
  recoverVigorPercent: 5,
  recoverHandSize: 7,
  inventoryCapacity: 10,
  purseCapacity: 300,
  vaultCapacity: 30,
  vaultDeckSlots: 10,
  vaultGoldCapacity: 2000,
})

/** Inteiros, inclusivos. Além deles, `minPlayers ≤ maxPlayers`. */
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
  recoverVigorPercent: { min: 0, max: 100 },
  recoverHandSize: { min: 0, max: 200 },
  inventoryCapacity: { min: 0, max: 100 },
  purseCapacity: { min: 0, max: 1000000 },
  vaultCapacity: { min: 0, max: 1000 },
  vaultDeckSlots: { min: 1, max: 100 },
  vaultGoldCapacity: { min: 0, max: 10000000 },
})
