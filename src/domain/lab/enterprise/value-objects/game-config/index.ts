import { type Either, left, right } from '@/core/error/either'
import { ValueObject } from '@/core/value-object'
import {
  ENEMY_ABILITY_PRIORITIES,
  ENEMY_BEHAVIORS,
} from '@/domain/catalog/enterprise/value-objects/card'

import {
  GAME_CONFIG_DEFAULTS,
  GAME_CONFIG_LIMITS,
  isAiPlayerPriorities,
  type TGameConfigKey,
  type TEnemyAbilityPriorities,
  type TGameConfigValues,
  type TReserveDeckEntry,
} from './defaults'

const BOOSTER_CHANCE_KEYS = [
  'boosterChanceCommon',
  'boosterChanceUncommon',
  'boosterChanceRare',
  'boosterChanceEpic',
  'boosterChanceLegendary',
] as const

/** Motivos de CONTRATO FEAT-03 (`LabConfigInvalidDetails`). */
export type TGameConfigIssue =
  | { field: null; reason: 'invalidBody' }
  | {
      field: string
      reason:
        | 'unknownKey'
        | 'notInteger'
        | 'outOfRange'
        | 'minAboveMax'
        | 'sumMismatch'
        | 'invalidPriorities'
    }

/** Valores ajustáveis do Apêndice A em vigor (D-11). */
export class GameConfig extends ValueObject<TGameConfigValues> {
  get values(): TGameConfigValues {
    return structuredClone(this.props)
  }

  static create(values: TGameConfigValues): GameConfig {
    return new GameConfig(structuredClone(values))
  }

  static withDefaults(): GameConfig {
    return new GameConfig(GAME_CONFIG_DEFAULTS)
  }

  /**
   * Ajuste parcial sobre os valores atuais (REQ-05, REQ-06). Tudo ou nada:
   * qualquer problema devolve a lista inteira, na ordem das chaves do pedido,
   * com `minAboveMax` (das duas chaves) por último.
   */
  applyPatch(input: unknown): Either<TGameConfigIssue[], GameConfig> {
    if (!isPlainObject(input)) {
      return left([{ field: null, reason: 'invalidBody' }])
    }

    const issues: TGameConfigIssue[] = []
    const next: TGameConfigValues = { ...this.props }

    for (const [field, value] of Object.entries(input)) {
      if (!isGameConfigKey(field)) {
        issues.push({ field, reason: 'unknownKey' })
        continue
      }
      if (field === 'reserveDeck') {
        next.reserveDeck = validateReserveDeck(value, issues)
        continue
      }
      if (field === 'aiPlayerPriorities') {
        if (isAiPlayerPriorities(value)) {
          next.aiPlayerPriorities = [...value]
        } else {
          issues.push({ field, reason: 'invalidPriorities' })
        }
        continue
      }
      if (field === 'enemyAbilityPriorities') {
        next.enemyAbilityPriorities = validateEnemyAbilityPriorities(
          value,
          issues
        )
        continue
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push({ field, reason: 'notInteger' })
        continue
      }
      const { min, max } = GAME_CONFIG_LIMITS[field]
      if (value < min || value > max) {
        issues.push({ field, reason: 'outOfRange' })
        continue
      }
      next[field] = value
    }

    if (next.minPlayers > next.maxPlayers) {
      issues.push(
        { field: 'minPlayers', reason: 'minAboveMax' },
        { field: 'maxPlayers', reason: 'minAboveMax' }
      )
    }
    if (next.marketFactorMinPercent > next.marketFactorMaxPercent) {
      issues.push(
        { field: 'marketFactorMinPercent', reason: 'minAboveMax' },
        { field: 'marketFactorMaxPercent', reason: 'minAboveMax' }
      )
    }
    // REQ-137: as chances do booster somam 1000 (por mil).
    if (BOOSTER_CHANCE_KEYS.reduce((sum, key) => sum + next[key], 0) !== 1000) {
      for (const field of BOOSTER_CHANCE_KEYS) {
        issues.push({ field, reason: 'sumMismatch' })
      }
    }

    if (issues.length > 0) {
      return left(issues)
    }

    return right(new GameConfig(next))
  }
}

function validateEnemyAbilityPriorities(
  input: unknown,
  issues: TGameConfigIssue[]
): TEnemyAbilityPriorities {
  const field = 'enemyAbilityPriorities'
  const priorities = { ...GAME_CONFIG_DEFAULTS.enemyAbilityPriorities }
  if (!isPlainObject(input)) {
    issues.push({ field, reason: 'outOfRange' })
    return priorities
  }
  for (const key of Object.keys(input)) {
    if (!(ENEMY_BEHAVIORS as readonly string[]).includes(key)) {
      issues.push({ field: `${field}.${key}`, reason: 'unknownKey' })
    }
  }
  for (const behavior of ENEMY_BEHAVIORS) {
    const values = input[behavior]
    if (
      !Array.isArray(values) ||
      values.length < GAME_CONFIG_LIMITS.enemyAbilityPriorities.minEntries ||
      new Set(values).size !== values.length ||
      !values.every((value) => ENEMY_ABILITY_PRIORITIES.includes(value))
    ) {
      issues.push({ field: `${field}.${behavior}`, reason: 'outOfRange' })
      continue
    }
    priorities[behavior] = [...values]
  }
  return priorities
}

function validateReserveDeck(
  input: unknown,
  issues: TGameConfigIssue[]
): TReserveDeckEntry[] {
  const { minEntries, minWeight } = GAME_CONFIG_LIMITS.reserveDeck
  if (!Array.isArray(input) || input.length < minEntries) {
    issues.push({ field: 'reserveDeck', reason: 'outOfRange' })
    return []
  }

  const entries: TReserveDeckEntry[] = []
  for (const [index, entry] of input.entries()) {
    const path = `reserveDeck.${index}`
    if (
      !isPlainObject(entry) ||
      (entry.type !== 'gold' && entry.type !== 'card')
    ) {
      issues.push({ field: `${path}.type`, reason: 'outOfRange' })
      continue
    }
    const weight = positiveInteger(
      entry.weight,
      minWeight,
      `${path}.weight`,
      issues
    )
    if (entry.type === 'gold') {
      const amount = positiveInteger(entry.amount, 1, `${path}.amount`, issues)
      entries.push({ type: 'gold', amount, weight })
    } else if (typeof entry.cardId !== 'string' || entry.cardId.trim() === '') {
      issues.push({ field: `${path}.cardId`, reason: 'outOfRange' })
    } else {
      entries.push({ type: 'card', cardId: entry.cardId, weight })
    }
  }
  return entries
}

function positiveInteger(
  value: unknown,
  min: number,
  field: string,
  issues: TGameConfigIssue[]
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push({ field, reason: 'notInteger' })
    return min
  }
  if (!Number.isSafeInteger(value) || value < min) {
    issues.push({ field, reason: 'outOfRange' })
  }
  return value
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function isGameConfigKey(field: string): field is TGameConfigKey {
  return Object.hasOwn(GAME_CONFIG_DEFAULTS, field)
}
